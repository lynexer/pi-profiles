import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { BorderedLoader, DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, type SelectItem, SelectList, Spacer, Text } from '@mariozechner/pi-tui';
import type { BitwardenClient } from './bitwarden.js';
import { MaskedInput } from './masked-input.js';
import type { ProfileAction, ProfilesConfig } from './types.js';

export class ProfileUI {
    constructor(private ctx: ExtensionCommandContext) {}

    async withLoader<T>(
        message: string,
        task: (signal: AbortSignal) => Promise<T>
    ): Promise<T | null> {
        return this.ctx.ui.custom<T | null>((tui, theme, _kb, done) => {
            const loader = new BorderedLoader(tui, theme, message);

            loader.onAbort = () => done(null);

            task(loader.signal)
                .then(done)
                .catch(() => done(null));

            return loader;
        });
    }

    async promptPassword(label: string): Promise<string | undefined> {
        return this.ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
            const input = new MaskedInput(theme.fg('accent', label));

            input.onSubmit = (val) => done(val || undefined);
            input.onCancel = () => done(undefined);

            const container = new Container();

            container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
            container.addChild(
                new Text(
                    `  ${theme.fg('accent', theme.bold('Bitwarden'))}  ${theme.fg('muted', 'vault unlock required')}`,
                    1,
                    0
                )
            );

            container.addChild(new Text(theme.fg('borderAccent', '─'.repeat(40)), 0, 0));
            container.addChild(new Spacer(1));
            container.addChild(input);
            container.addChild(new Spacer(1));
            container.addChild(
                new Text(
                    `  ${theme.fg('dim', 'enter')} ${theme.fg('muted', 'confirm')}  ${theme.fg('dim', 'esc')} ${theme.fg('muted', 'cancel')}`,
                    1,
                    0
                )
            );

            container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

            let _focused = false;

            return {
                render: (w) => container.render(w),
                invalidate: () => {
                    container.invalidate();
                    input.invalidate();
                },
                handleInput: (data) => {
                    input.handleInput(data);
                    tui.requestRender();
                },
                get focused() {
                    return _focused;
                },
                set focused(val: boolean) {
                    _focused = val;
                    input.focused = val;
                }
            };
        });
    }

    async selectFromList(
        title: string,
        subtitle: string,
        items: SelectItem[],
        accentColor: 'accent' | 'warning' = 'accent'
    ): Promise<string | null> {
        return this.ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
            const container = new Container();
            const color = (s: string) => theme.fg(accentColor, s);

            container.addChild(new DynamicBorder((s: string) => color(s)));
            container.addChild(
                new Text(`  ${color(theme.bold(title))}  ${theme.fg('muted', subtitle)}`, 1, 0)
            );

            container.addChild(new Text(color('─'.repeat(40)), 0, 0));
            container.addChild(new Spacer(1));

            const list = new SelectList(items, Math.min(items.length + 2, 12), {
                selectedPrefix: (t) => color(t),
                selectedText: (t) => theme.bg('selectedBg', color(theme.bold(t))),
                description: (t) => theme.fg('muted', t),
                scrollInfo: (t) => theme.fg('dim', t),
                noMatch: (t) => theme.fg('warning', t)
            });

            list.onSelect = (item) => done(item.value);
            list.onCancel = () => done(null);

            container.addChild(list);
            container.addChild(new Spacer(1));
            container.addChild(
                new Text(
                    `  ${theme.fg('dim', '↑↓')} ${theme.fg('muted', 'navigate')}  ${theme.fg('dim', 'enter')} ${theme.fg('muted', 'select')}  ${theme.fg('dim', 'esc')} ${theme.fg('muted', 'close')}`,
                    1,
                    0
                )
            );

            container.addChild(new DynamicBorder((s: string) => color(s)));

            return {
                render: (w) => container.render(w),
                invalidate: () => container.invalidate(),
                handleInput: (data) => {
                    list.handleInput(data);
                    tui.requestRender();
                }
            };
        });
    }

    async showProfileList(
        config: ProfilesConfig,
        activeName: string | undefined
    ): Promise<ProfileAction> {
        const profileNames = Object.keys(config.profiles);

        const items: SelectItem[] = [
            ...profileNames.map((name) => {
                const profile = config.profiles[name];
                const isActive = name === activeName;
                const isDefault = name === config.defaultProfile;
                const usesBitwarden = Object.values(profile.keys).some((v) =>
                    v.startsWith('bw://')
                );

                const badges = [
                    isActive ? '✓ active' : null,
                    isDefault ? '⭐ default' : null,
                    usesBitwarden ? '🔒 bitwarden' : '🔑 manual'
                ]
                    .filter(Boolean)
                    .join('  ');

                return {
                    value: `activate:${name}`,
                    label: name,
                    description: `${profile.provider}  ${badges}  ${Object.keys(profile.keys).join(', ')}`
                };
            }),
            { value: 'new', label: '+ New profile', description: 'Add a new provider profile' },
            ...(profileNames.length > 0
                ? [
                      {
                          value: 'setDefault',
                          label: '⭐ Set default profile',
                          description: 'Activate a profile when no directory matches'
                      },
                      ...(config.defaultProfile
                          ? [
                                {
                                    value: 'clearDefault',
                                    label: '✕ Clear default profile',
                                    description: `Currently: ${config.defaultProfile}`
                                }
                            ]
                          : []),
                      {
                          value: 'delete',
                          label: '− Delete a profile',
                          description: 'Remove an existing profile'
                      }
                  ]
                : [])
        ];

        const result = await this.selectFromList(
            'pi-profiles',
            'manage your provider profiles',
            items
        );

        if (!result) return null;
        if (result === 'new') return { action: 'new' };
        if (result === 'delete') return { action: 'delete', name: '' };
        if (result === 'setDefault') return { action: 'setDefault', name: '' };
        if (result === 'clearDefault') return { action: 'clearDefault' };

        return { action: 'activate', name: result.replace('activate:', '') };
    }

    async showDeletePicker(config: ProfilesConfig): Promise<string | null> {
        const items: SelectItem[] = Object.entries(config.profiles).map(([name, profile]) => ({
            value: name,
            label: name,
            description: `${profile.provider} · ${Object.keys(profile.keys).join(', ')}`
        }));

        return this.selectFromList('Delete profile', 'select one to remove', items, 'warning');
    }

    async unlockBitwarden(bw: BitwardenClient): Promise<boolean> {
        const status = await this.withLoader('Checking Bitwarden vault...', () => bw.checkStatus());

        if (status === 'unlocked') return true;
        if (status === 'error' || status === null) {
            this.ctx.ui.notify('Could not reach Bitwarden vault.', 'error');
            return false;
        }

        const password = await this.promptPassword('Bitwarden master password');
        if (!password) return false;

        const success = await this.withLoader('Unlocking vault...', () =>
            bw.unlockWithKey(password)
        );

        if (!success) {
            this.ctx.ui.notify('Bitwarden unlock failed — check your master password.', 'error');
        }

        return success ?? false;
    }

    async fetchSecret(bw: BitwardenClient, itemName: string): Promise<string | null> {
        const secret = await this.withLoader(`Fetching "${itemName}" from vault...`, () =>
            bw.getSecret(itemName)
        );

        return secret ?? null;
    }
}
