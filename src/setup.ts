import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
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

        const provider =
            providerChoice === 'other'
                ? await this.ctx.ui.input('Provider name:', 'e.g. my-provider')
                : providerChoice;

        if (!provider) return null;

        const defaultEnvVar = KNOWN_PROVIDERS[provider];
        let envVar: string | undefined;

        if (defaultEnvVar) {
            const envChoice = await this.ctx.ui.select(`Environment variable for "${provider}":`, [
                defaultEnvVar,
                'Use a different name'
            ]);

            if (!envChoice) return null;
            envVar =
                envChoice === 'Use a different name'
                    ? await this.ctx.ui.input('Environment variable name:', defaultEnvVar)
                    : envChoice;
        } else {
            envVar = await this.ctx.ui.input('Environment variable name:', 'API_KEY');
        }

        if (!envVar) return null;

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
                `Bitwarden item name for "${name}" ${envVar}:`,
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

        return { name, profile: { provider, keys: { [envVar]: keyValue } } };
    }

    async configureDirectories(): Promise<void> {
        const profileNames = Object.keys(this.config.get().profiles);
        if (profileNames.length === 0) return;

        this.ctx.ui.notify('Map directories to profiles. Leave blank to finish.', 'info');

        while (true) {
            const dir = await this.ctx.ui.input(
                'Directory path (leave blank to finish):',
                'e.g. ~/work'
            );
            if (!dir?.trim()) break;

            const target = await this.ctx.ui.select(`Profile for "${dir}"?`, profileNames);
            if (!target) break;

            this.config.addDirectory(dir, target);
        }

        const profileNamesWithNone = [...profileNames, '(none)'];
        const defaultProfile = await this.ctx.ui.select(
            'Default profile when no directory matches?',
            profileNamesWithNone
        );

        if (defaultProfile && defaultProfile !== '(none)') {
            this.config.setDefault(defaultProfile);
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

                    const isFirst = Object.keys(this.config.get().profiles).length === 1;

                    if (isFirst) {
                        const setupDirs = await this.ctx.ui.confirm(
                            'Set up directory mappings?',
                            'Map directories like ~/work to this profile'
                        );

                        if (setupDirs) await this.configureDirectories();
                    }

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
        }
    }
}
