import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { BitwardenClient } from './bitwarden.js';
import { ConfigManager } from './config.js';
import { ProfileSetup } from './setup.js';
import { ProfileUI } from './ui.js';

export default function (pi: ExtensionAPI) {
    const config = new ConfigManager();
    const bw = new BitwardenClient();

    pi.registerCommand('profile', {
        description: "Show active profile, or 'list' to manage profiles",
        handler: async (args, ctx) => {
            await config.load();

            if (args.trim() === 'list') {
                const active = config.resolveProfile(ctx.cwd)?.name;
                const setup = new ProfileSetup(ctx, config, bw);
                const result = await setup.run(active);

                if (result?.forceActivate) {
                    await config.load();

                    const profile = config.get().profiles[result.forceActivate];

                    if (!profile) return;

                    const ui = new ProfileUI(ctx);
                    for (const [envVar, value] of Object.entries(profile.keys)) {
                        if (value.startsWith('bw://')) {
                            const unlocked = await ui.unlockBitwarden(bw);
                            if (!unlocked) return;

                            const secret = await ui.fetchSecret(bw, value.slice(5));
                            if (secret) process.env[envVar] = secret;
                        } else {
                            process.env[envVar] = value;
                        }
                    }

                    ctx.ui.notify(`Switched to profile "${result.forceActivate}"`, 'info');
                }

                return;
            }

            const match = config.resolveProfile(ctx.cwd);

            if (!match) {
                ctx.ui.notify(
                    'No profile active for this directory. Try /profile list to set one up.',
                    'warning'
                );
                return;
            }

            ctx.ui.notify(`Active profile: "${match.name}" (${match.profile.provider})`, 'info');
        }
    });

    pi.on('session_start', async (_event, ctx) => {
        await config.load();

        if (!config.exists()) {
            ctx.ui.notify(
                'pi-profiles: No config found. Run /profile list to get started.',
                'info'
            );
            return;
        }

        const match = config.resolveProfile(ctx.cwd);
        if (!match) return;

        const { name, profile } = match;

        for (const [envVar, value] of Object.entries(profile.keys)) {
            if (value.startsWith('bw://')) {
                const status = await bw.checkStatus();

                if (status === 'locked') {
                    const password = await ctx.ui.input(
                        'Bitwarden master password:',
                        'Unlock your vault'
                    );

                    if (!password) {
                        ctx.ui.notify('pi-profiles: Bitwarden unlock cancelled.', 'warning');
                        return;
                    }

                    const unlocked = await bw.unlockWithKey(password);

                    if (!unlocked) {
                        ctx.ui.notify('pi-profiles: Bitwarden unlock failed.', 'error');
                        return;
                    }
                }

                const secret = await bw.getSecret(value.slice(5));

                if (!secret) {
                    ctx.ui.notify(
                        `pi-profiles: Could not fetch "${value.slice(5)}" from vault.`,
                        'error'
                    );
                    return;
                }

                process.env[envVar] = secret;
            } else {
                process.env[envVar] = value;
            }
        }

        ctx.ui.notify(`pi-profiles: "${name}" active (${match.profile.provider})`, 'info');
    });

    pi.on('session_shutdown', async () => {
        bw.clearSession();
    });
}
