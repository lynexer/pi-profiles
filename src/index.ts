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
        description: 'Set up pi-profiles: configure providers, API keys, and directory mappings',
        handler: async (_args, ctx) => {
            await runSetup(ctx);
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

            ctx.ui.notify(
                `Active profile: "${match.name}" (${match.profile.provider}/${match.profile.model})`,
                'info'
            );
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
                const itemName = value.slice(5);

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

                const secret = await getSecret(itemName);

                if (!secret) {
                    ctx.ui.notify(
                        `pi-profiles: Could not fetch "${itemName}" from vault.`,
                        'error'
                    );
                    return;
                }

                process.env[envVar] = secret;
            } else {
                process.env[envVar] = value;
            }
        }

        const model = ctx.modelRegistry.find(profile.provider, profile.model);

        if (model) {
            await pi.setModel(model);
        }

        ctx.ui.notify(`pi-profiles: "${name}" (${profile.provider}/${profile.model})`, 'info');
    });

    pi.on('session_shutdown', async () => {
        clearSession();
    });
}
