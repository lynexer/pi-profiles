import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { BitwardenClient } from './bitwarden.js';
import type { ConfigManager } from './config.js';
import { KNOWN_PROVIDERS, type Profile } from './types.js';
import { ProfileUI } from './ui.js';

export class ProfileSetup {
    private ui: ProfileUI;

    constructor(
        private ctx: ExtensionCommandContext,
        private config: ConfigManager,
        private bw: BitwardenClient
    ) {
        this.ui = new ProfileUI(ctx);
    }

    async createProfile(): Promise<{ name: string; profile: Profile } | null> {
        const name = await this.ctx.ui.input('Profile name:', 'e.g. work, personal');
        if (!name?.trim()) return null;

        const providerChoice = await this.ctx.ui.select('Provider:', [
            ...Object.keys(KNOWN_PROVIDERS),
            'other'
        ]);

        if (!providerChoice) return null;

        const isKnown = providerChoice !== 'other';

        const provider = isKnown
            ? providerChoice
            : await this.ctx.ui.input('Provider name:', 'e.g. my-provider');

        if (!provider) return null;

        const credentialTarget = isKnown
            ? KNOWN_PROVIDERS[provider]
            : await this.ctx.ui.input('Environment variable name:', 'API_KEY');

        if (!credentialTarget) return null;

        const keyMode = await this.ctx.ui.select(`How to store the API key for "${name}"?`, [
            'Bitwarden (recommended)',
            'Enter key manually'
        ]);

        if (!keyMode) return null;

        const useBitwarden = keyMode === 'Bitwarden (recommended)';
        let keyValue: string;

        if (useBitwarden) {
            const unlocked = await this.ui.unlockBitwarden(this.bw);
            if (!unlocked) return null;

            const bwItemName = await this.ctx.ui.input(
                `Bitwarden item name for "${name}" ${credentialTarget}:`,
                'e.g. Work Anthropic Key'
            );

            if (!bwItemName) return null;

            const secret = await this.ui.fetchSecret(this.bw, bwItemName);

            if (!secret) {
                this.ctx.ui.notify(
                    `Could not find "${bwItemName}" in vault. Check the item name and try again.`,
                    'error'
                );
                return null;
            }

            this.ctx.ui.notify('Key verified!', 'info');

            keyValue = `bw://${bwItemName}`;
        } else {
            const literal = await this.ctx.ui.input(`API key for "${name}":`, 'sk-...');
            if (!literal) return null;

            keyValue = literal;
        }

        return { name, profile: { provider, keys: { [credentialTarget]: keyValue } } };
    }

    async configureDirectories(profileName: string): Promise<void> {
        this.ctx.ui.notify(
            `Add directories that should activate the "${profileName}" profile. Leave blank when done.`,
            'info'
        );

        let count = 0;

        while (true) {
            const dir = await this.ctx.ui.input(
                count === 0
                    ? 'First directory path (leave blank to skip):'
                    : 'Add another directory (leave blank to finish):',
                'e.g. ~/work'
            );

            if (!dir?.trim()) break;

            this.config.addDirectory(dir, profileName);

            count++;

            this.ctx.ui.notify(`✓ "${dir}" → "${profileName}"`, 'info');
        }

        if (count === 0) return;

        const profileNames = Object.keys(this.config.get().profiles);

        if (profileNames.length > 1) {
            const profileNamesWithNone = [...profileNames, '(none)'];
            const defaultProfile = await this.ctx.ui.select(
                'Default profile when no directory matches?',
                profileNamesWithNone
            );

            if (defaultProfile && defaultProfile !== '(none)') {
                this.config.setDefault(defaultProfile);
            }
        } else {
            this.config.setDefault(profileName);
        }
    }

    async run(activeName: string | undefined): Promise<{ forceActivate?: string } | undefined> {
        await this.config.load();

        while (true) {
            const action = await this.ui.showProfileList(this.config.get(), activeName);
            if (!action) break;

            if (action.action === 'activate') {
                await this.config.save();

                return { forceActivate: action.name };
            }

            if (action.action === 'new') {
                const result = await this.createProfile();

                if (result) {
                    this.config.addProfile(result.name, result.profile);

                    const setupDirs = await this.ctx.ui.confirm(
                        'Set up directory mappings?',
                        'Map directories like ~/work to this profile'
                    );

                    if (setupDirs) await this.configureDirectories(result.name);

                    await this.config.save();

                    this.ctx.ui.notify(`Profile "${result.name}" created.`, 'info');
                }

                continue;
            }

            if (action.action === 'delete') {
                const toDelete = await this.ui.showDeletePicker(this.config.get());

                if (toDelete) {
                    const confirmed = await this.ctx.ui.confirm(
                        `Delete "${toDelete}"?`,
                        'This cannot be undone'
                    );

                    if (confirmed) {
                        this.config.deleteProfile(toDelete);

                        await this.config.save();

                        this.ctx.ui.notify(`Profile "${toDelete}" deleted.`, 'info');
                    }
                }
            }

            if (action.action === 'setDefault') {
                const profileNames = Object.keys(this.config.get().profiles);
                const target = await this.ctx.ui.select(
                    'Which profile should be the default?',
                    profileNames
                );

                if (target) {
                    this.config.setDefault(target);
                    await this.config.save();
                    this.ctx.ui.notify(`"${target}" set as default profile.`, 'info');
                }

                continue;
            }

            if (action.action === 'clearDefault') {
                this.config.setDefault(undefined);

                await this.config.save();

                this.ctx.ui.notify('Default profile cleared.', 'info');
            }
        }
    }
}
