import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { DynamicBorder } from '@mariozechner/pi-coding-agent';
import { Container, type SelectItem, SelectList, Spacer, Text } from '@mariozechner/pi-tui';
import { getSecret, unlock } from './bitwarden.js';
import { loadConfig, type Profile, type ProfilesConfig, saveConfig } from './config.js';

const KNOWN_PROVIDERS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    groq: 'GROQ_API_KEY'
};

type ProfileAction =
    | { action: 'activate'; name: string }
    | { action: 'new' }
    | { action: 'delete'; name: string }
    | null;

async function showProfileList(
    ctx: ExtensionCommandContext,
    config: ProfilesConfig,
    activeName: string | undefined
): Promise<ProfileAction> {
    const profileNames = Object.keys(config.profiles);

    const items: SelectItem[] = [
        ...profileNames.map((name) => {
            const profile = config.profiles[name];
            const isActive = name === activeName;
            return {
                value: `activate:${name}`,
                label: isActive ? `${name} ●` : name,
                description: `${profile.provider} · ${Object.keys(profile.keys).join(', ')}`
            };
        }),
        { value: 'new', label: '+ New profile' },
        ...(profileNames.length > 0 ? [{ value: 'delete', label: '− Delete a profile' }] : [])
    ];

    return ctx.ui.custom<ProfileAction>((tui, theme, _kb, done) => {
        const container = new Container();

        container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
        container.addChild(new Text(theme.fg('accent', theme.bold(' pi-profiles')), 1, 0));
        container.addChild(new Spacer(1));

        const list = new SelectList(items, Math.min(items.length + 2, 12), {
            selectedPrefix: (t) => theme.fg('accent', t),
            selectedText: (t) => theme.fg('accent', t),
            description: (t) => theme.fg('muted', t),
            scrollInfo: (t) => theme.fg('dim', t),
            noMatch: (t) => theme.fg('warning', t)
        });

        list.onSelect = (item) => {
            if (item.value === 'new') return done({ action: 'new' });
            if (item.value === 'delete') return done({ action: 'delete', name: '' });
            const name = item.value.replace('activate:', '');
            done({ action: 'activate', name });
        };
        list.onCancel = () => done(null);

        container.addChild(list);
        container.addChild(new Spacer(1));
        container.addChild(
            new Text(theme.fg('dim', ' ↑↓ navigate · enter select · esc close'), 1, 0)
        );
        container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

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

async function showDeletePicker(
    ctx: ExtensionCommandContext,
    config: ProfilesConfig
): Promise<string | null> {
    const names = Object.keys(config.profiles);
    if (names.length === 0) return null;

    const items: SelectItem[] = names.map((name) => ({ value: name, label: name }));

    return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const container = new Container();

        container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
        container.addChild(new Text(theme.fg('warning', theme.bold(' Delete profile')), 1, 0));
        container.addChild(new Spacer(1));

        const list = new SelectList(items, Math.min(items.length + 2, 10), {
            selectedPrefix: (t) => theme.fg('warning', t),
            selectedText: (t) => theme.fg('warning', t),
            description: (t) => theme.fg('muted', t),
            scrollInfo: (t) => theme.fg('dim', t),
            noMatch: (t) => theme.fg('warning', t)
        });

        list.onSelect = (item) => done(item.value);
        list.onCancel = () => done(null);

        container.addChild(list);
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg('dim', ' enter delete · esc cancel'), 1, 0));
        container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

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

async function createProfile(
    ctx: ExtensionCommandContext
): Promise<{ name: string; profile: Profile } | null> {
    const name = await ctx.ui.input('Profile name:', 'e.g. work, personal');
    if (!name?.trim()) return null;

    const providerChoice = await ctx.ui.select('Provider:', [
        ...Object.keys(KNOWN_PROVIDERS),
        'other'
    ]);

    if (!providerChoice) return null;

    const provider =
        providerChoice === 'other'
            ? await ctx.ui.input('Provider name:', 'e.g. my-provider')
            : providerChoice;

    if (!provider) return null;

    const defaultEnvVar = KNOWN_PROVIDERS[provider];
    let envVar: string | undefined;

    if (defaultEnvVar) {
        const envChoice = await ctx.ui.select(`Environment variable for "${provider}" API key:`, [
            defaultEnvVar,
            'Use a different name'
        ]);

        if (!envChoice) return null;

        envVar =
            envChoice === 'Use a different name'
                ? await ctx.ui.input('Environment variable name:', defaultEnvVar)
                : envChoice;
    } else {
        envVar = await ctx.ui.input('Environment variable name:', 'API_KEY');
    }

    if (!envVar) return null;

    const keyMode = await ctx.ui.select(`How to store the API key for "${name}"?`, [
        'Bitwarden (recommended)',
        'Enter key manually'
    ]);

    if (!keyMode) return null;

    const useBitwarden = keyMode === 'Bitwarden (recommended)';
    let keyValue: string;

    if (useBitwarden) {
        const unlocked = await unlock((title, placeholder) => ctx.ui.input(title, placeholder));

        if (!unlocked) {
            ctx.ui.notify('Could not unlock Bitwarden vault.', 'error');
            return null;
        }

        const bwItemName = await ctx.ui.input(
            `Bitwarden item name for "${name}" ${envVar}:`,
            'e.g. Work Anthropic Key'
        );

        if (!bwItemName) return null;

        ctx.ui.notify(`Verifying "${bwItemName}" in vault...`, 'info');

        const secret = await getSecret(bwItemName);

        if (!secret) {
            ctx.ui.notify(
                `Could not find "${bwItemName}" in vault. Check the item name and try again.`,
                'error'
            );

            return null;
        }
        ctx.ui.notify('Key verified!', 'info');

        keyValue = `bw://${bwItemName}`;
    } else {
        const literal = await ctx.ui.input(`API key for "${name}":`, 'sk-...');
        if (!literal) return null;

        keyValue = literal;
    }

    return { name, profile: { provider, keys: { [envVar]: keyValue } } };
}

async function configureDirectories(
    ctx: ExtensionCommandContext,
    config: ProfilesConfig
): Promise<void> {
    const profileNames = Object.keys(config.profiles);
    if (profileNames.length === 0) return;

    ctx.ui.notify('Map directories to profiles. This is optional — leave blank to skip.', 'info');

    while (true) {
        const dir = await ctx.ui.input('Directory path (leave blank to finish):', 'e.g. ~/work');
        if (!dir?.trim()) break;

        const targetProfile = await ctx.ui.select(`Which profile for "${dir}"?`, profileNames);
        if (!targetProfile) break;

        config.directories[dir] = targetProfile;
    }

    const defaultProfile = await ctx.ui.select('Default profile when no directory matches?', [
        ...profileNames,
        '(none)'
    ]);
    if (defaultProfile && defaultProfile !== '(none)') {
        config.defaultProfile = defaultProfile;
    }
}

export async function runSetup(
    ctx: ExtensionCommandContext,
    activeName: string | undefined
): Promise<{ forceActivate?: string } | undefined> {
    const config = (await loadConfig()) ?? { profiles: {}, directories: {} };

    while (true) {
        const action = await showProfileList(ctx, config, activeName);

        if (!action) break;

        if (action.action === 'activate') {
            await saveConfig(config);
            return { forceActivate: action.name };
        }

        if (action.action === 'new') {
            const result = await createProfile(ctx);

            if (result) {
                config.profiles[result.name] = result.profile;

                if (Object.keys(config.profiles).length === 1) {
                    const setupDirs = await ctx.ui.confirm(
                        'Set up directory mappings?',
                        'Map directories like ~/work to this profile'
                    );

                    if (setupDirs) await configureDirectories(ctx, config);
                }

                await saveConfig(config);

                ctx.ui.notify(`Profile "${result.name}" created.`, 'info');
            }

            continue;
        }

        if (action.action === 'delete') {
            const toDelete = await showDeletePicker(ctx, config);

            if (toDelete) {
                const confirmed = await ctx.ui.confirm(
                    `Delete "${toDelete}"?`,
                    'This cannot be undone'
                );

                if (confirmed) {
                    delete config.profiles[toDelete];

                    for (const [dir, pName] of Object.entries(config.directories)) {
                        if (pName === toDelete) delete config.directories[dir];
                    }

                    if (config.defaultProfile === toDelete) delete config.defaultProfile;

                    await saveConfig(config);

                    ctx.ui.notify(`Profile "${toDelete}" deleted.`, 'info');
                }
            }
        }
    }
}
