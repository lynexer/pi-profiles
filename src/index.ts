import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { BitwardenClient } from './bitwarden.js';
import { ConfigManager } from './config.js';
import { ProfileSetup } from './setup.js';
import { isKnownProviderId, type Profile } from './types.js';
import { ProfileUI } from './ui.js';

function escapeApiKey(key: string): string {
    const escaped = key.split('$').join('$$');

    return escaped.startsWith('!') ? `$${escaped}` : escaped;
}

function applyProfileKeys(pi: ExtensionAPI, resolved: Map<string, string>): Set<string> {
    const registered = new Set<string>();

    for (const [key, secret] of resolved) {
        if (isKnownProviderId(key)) {
            pi.registerProvider(key, { apiKey: escapeApiKey(secret) });
            registered.add(key);
        } else {
            process.env[key] = secret;
        }
    }

    return registered;
}

async function tryResolveNonInteractive(
    profile: Profile,
    bw: BitwardenClient
): Promise<Map<string, string> | null> {
    const resolved = new Map<string, string>();

    for (const [key, value] of Object.entries(profile.keys)) {
        if (value.startsWith('bw://')) {
            if ((await bw.checkStatus()) !== 'unlocked') return null;

            const secret = await bw.getSecret(value.slice(5));

            if (!secret) return null;

            resolved.set(key, secret);
        } else {
            resolved.set(key, value);
        }
    }

    return resolved;
}

export default async function (pi: ExtensionAPI) {
    const config = new ConfigManager();
    const bw = new BitwardenClient();
    const registeredProviders = new Set<string>();

    await config.load();

    const initial = config.resolveProfile(process.cwd());

    if (initial) {
        const resolved = await tryResolveNonInteractive(initial.profile, bw);

        if (resolved) {
            for (const id of applyProfileKeys(pi, resolved)) {
                registeredProviders.add(id);
            }
        }
    }

    async function resolveKeys(
        profile: Profile,
        unlock: () => Promise<boolean>,
        fetchSecret: (itemName: string) => Promise<string | null | undefined>
    ): Promise<Map<string, string> | null> {
        const resolved = new Map<string, string>();

        for (const [key, value] of Object.entries(profile.keys)) {
            if (value.startsWith('bw://')) {
                if (!(await unlock())) return null;

                const secret = await fetchSecret(value.slice(5));

                if (!secret) return null;

                resolved.set(key, secret);
            } else {
                resolved.set(key, value);
            }
        }

        return resolved;
    }

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
                    const resolved = await resolveKeys(
                        profile,
                        () => ui.unlockBitwarden(bw),
                        (itemName) => ui.fetchSecret(bw, itemName)
                    );

                    if (!resolved) return;

                    for (const id of applyProfileKeys(pi, resolved)) {
                        registeredProviders.add(id);
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

        const resolved = await resolveKeys(
            profile,
            async () => {
                const status = await bw.checkStatus();

                if (status === 'unlocked') return true;
                if (status === 'error') {
                    ctx.ui.notify('pi-profiles: Could not reach Bitwarden vault.', 'error');
                    return false;
                }

                const password = await ctx.ui.input(
                    'Bitwarden master password:',
                    'Unlock your vault'
                );

                if (!password) {
                    ctx.ui.notify('pi-profiles: Bitwarden unlock cancelled.', 'warning');
                    return false;
                }

                const unlocked = await bw.unlockWithKey(password);

                if (!unlocked) {
                    ctx.ui.notify('pi-profiles: Bitwarden unlock failed.', 'error');
                }

                return unlocked;
            },
            (itemName) => bw.getSecret(itemName)
        );

        if (!resolved) return;

        for (const id of applyProfileKeys(pi, resolved)) {
            registeredProviders.add(id);
        }

        ctx.ui.notify(`pi-profiles: "${name}" active (${profile.provider})`, 'info');
    });

    pi.on('session_shutdown', async () => {
        for (const id of registeredProviders) {
            try {
                pi.unregisterProvider(id);
            } catch {
                // Provider may already be unregistered or removed.
            }
        }

        registeredProviders.clear();
        bw.clearSession();
    });
}
