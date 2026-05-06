import { homedir } from 'node:os';
import { normalize } from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { clearSession, getSecret, unlock } from './bitwarden.js';
import { configExists, loadConfig, type ProfilesConfig } from './config.js';
import { runSetup } from './setup.js';

function resolveProfile(config: ProfilesConfig, cwd: string) {
    const normalizedCwd = normalize(cwd);

    const sorted = Object.entries(config.directories).sort(([a], [b]) => b.length - a.length);

    for (const [dir, profileName] of sorted) {
        const expanded = normalize(dir.replace(/^~/, homedir()));

        if (normalizedCwd.startsWith(expanded)) {
            const profile = config.profiles[profileName];

            if (profile) return { name: profileName, profile };
        }
    }

    if (config.defaultProfile) {
        const profile = config.profiles[config.defaultProfile];

        if (profile) return { name: config.defaultProfile, profile };
    }

    return undefined;
}

export default function (pi: ExtensionAPI) {
    pi.registerCommand('profiles-setup', {
        description: 'Manage profiles — create, switch, or delete',
        handler: async (_args, ctx) => {
            const config = await loadConfig();
            const active = config ? resolveProfile(config, ctx.cwd)?.name : undefined;
            const result = await runSetup(ctx, active);

            if (result?.forceActivate) {
                const freshConfig = await loadConfig();
                if (!freshConfig) return;
                const profile = freshConfig.profiles[result.forceActivate];
                if (!profile) return;

                for (const [envVar, value] of Object.entries(profile.keys)) {
                    if (value.startsWith('bw://')) {
                        const secret = await getSecret(value.slice(5));
                        if (secret) process.env[envVar] = secret;
                    } else {
                        process.env[envVar] = value;
                    }
                }
                ctx.ui.notify(`Switched to profile "${result.forceActivate}"`, 'info');
            }
        }
    });

    pi.registerCommand('profiles', {
        description: 'Show the currently active profile',
        handler: async (_args, ctx) => {
            const config = await loadConfig();

            if (!config) {
                ctx.ui.notify('No profiles.json found. Run /profiles-setup first.', 'warning');
                return;
            }

            const match = resolveProfile(config, ctx.cwd);

            if (!match) {
                ctx.ui.notify('No profile matches this directory.', 'warning');
                return;
            }

            ctx.ui.notify(`Active profile: "${match.name}" (${match.profile.provider})`, 'info');
        }
    });

    pi.on('session_start', async (_event, ctx) => {
        if (!configExists()) {
            ctx.ui.notify(
                'pi-profiles: No config found. Run /profiles-setup to get started.',
                'info'
            );

            return;
        }

        const config = await loadConfig();
        if (!config) return;

        const match = resolveProfile(config, ctx.cwd);
        if (!match) return;

        const { name, profile } = match;

        for (const [envVar, value] of Object.entries(profile.keys)) {
            if (value.startsWith('bw://')) {
                const unlocked = await unlock((title, placeholder) =>
                    ctx.ui.input(title, placeholder)
                );
                if (!unlocked) {
                    ctx.ui.notify(
                        'pi-profiles: Bitwarden unlock failed — profile not activated.',
                        'error'
                    );
                    return;
                }

                const secret = await getSecret(value.slice(5));
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

        ctx.ui.notify(`pi-profiles: "${name}" active`, 'info');
    });

    pi.on('session_shutdown', async () => {
        clearSession();
    });
}
