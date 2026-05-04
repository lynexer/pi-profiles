import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { getSecret, unlock } from './bitwarden.js';
import { loadConfig, type ProfilesConfig, saveConfig } from './config.js';

export async function runSetup(ctx: ExtensionCommandContext): Promise<void> {
    ctx.ui.notify('Welcome to pi-profiles setup!', 'info');

    const existing = await loadConfig();
    const config: ProfilesConfig = existing ?? { profiles: {}, directories: {} };
    const keyMode = await ctx.ui.select('How would you like to store API keys?', [
        'Bitwarden (recommended)',
        'Enter keys manually'
    ]);

    if (!keyMode) return;

    const useBitwarden = keyMode === 'Bitwarden (recommended)';

    if (useBitwarden) {
        const unlocked = await unlock((title, placeholder) => ctx.ui.input(title, placeholder));

        if (!unlocked) {
            ctx.ui.notify('Could not unlock Bitwarden vault. Aborting setup.', 'error');
            return;
        }

        ctx.ui.notify('Vault unlocked!', 'info');
    }

    const profileCountStr = await ctx.ui.input(
        'How many profiles do you want to create?',
        'e.g. 2'
    );
    const profileCount = parseInt(profileCountStr ?? '0', 10);

    if (!profileCount || profileCount < 1) {
        ctx.ui.notify('No profiles created.', 'warning');
        return;
    }

    for (let i = 0; i < profileCount; i++) {
        ctx.ui.notify(`Setting up profile ${i + 1} of ${profileCount}`, 'info');

        const name = await ctx.ui.input(`Profile ${i + 1} name:`, 'e.g. work, personal');
        if (!name) return;

        const provider = await ctx.ui.select('Provider:', [
            'anthropic',
            'openai',
            'google',
            'mistral',
            'groq',
            'other'
        ]);

        if (!provider) return;

        const resolvedProvider =
            provider === 'other'
                ? await ctx.ui.input('Provider name:', 'e.g. my-provider')
                : provider;

        if (!resolvedProvider) return;

        const model = await ctx.ui.input('Model ID:', `e.g. claude-sonnet-4-20250514`);
        if (!model) return;

        const envVarDefaults: Record<string, string> = {
            anthropic: 'ANTHROPIC_API_KEY',
            openai: 'OPENAI_API_KEY',
            google: 'GOOGLE_API_KEY',
            mistral: 'MISTRAL_API_KEY',
            groq: 'GROQ_API_KEY'
        };

        const defaultEnvVar = envVarDefaults[resolvedProvider] ?? 'API_KEY';
        const envVar = await ctx.ui.input('Environment variable name for API key:', defaultEnvVar);

        if (!envVar) return;

        let keyValue: string;

        if (useBitwarden) {
            const bwItemName = await ctx.ui.input(
                `Bitwarden item name for "${name}" ${envVar}:`,
                `e.g. Work Anthropic Key`
            );

            if (!bwItemName) return;

            ctx.ui.notify(`Verifying "${bwItemName}" in vault...`, 'info');

            const secret = await getSecret(bwItemName);

            if (!secret) {
                ctx.ui.notify(
                    `Could not find "${bwItemName}" in vault. Check the item name and try /profiles-setup again.`,
                    'error'
                );
                return;
            }

            ctx.ui.notify('Key verified successfully!', 'info');

            keyValue = `bw://${bwItemName}`;
        } else {
            const literal = await ctx.ui.input(`API key for "${name}":`, 'sk-...');

            if (!literal) return;

            keyValue = literal;
        }

        config.profiles[name] = {
            provider: resolvedProvider,
            model,
            keys: { [envVar]: keyValue }
        };
    }

    ctx.ui.notify('Now map directories to profiles. Leave blank to finish.', 'info');

    let addingDirs = true;

    while (addingDirs) {
        const dir = await ctx.ui.input(
            'Directory path to map (leave blank to finish):',
            'e.g. ~/work or C:\\Users\\you\\work'
        );

        if (!dir?.trim()) {
            addingDirs = false;
            break;
        }

        const profileNames = Object.keys(config.profiles);
        const targetProfile = await ctx.ui.select(
            `Which profile should "${dir}" use?`,
            profileNames
        );

        if (!targetProfile) return;

        config.directories[dir] = targetProfile;
    }

    const profileNames = Object.keys(config.profiles);

    if (profileNames.length > 0) {
        const defaultProfile = await ctx.ui.select(
            'Which profile should be used when no directory matches?',
            [...profileNames, '(none)']
        );

        if (defaultProfile && defaultProfile !== '(none)') {
            config.defaultProfile = defaultProfile;
        }
    }

    await saveConfig(config);
    ctx.ui.notify(`Configuration saved to ~/.pi/agent/profiles.json`, 'info');
    ctx.ui.notify('Run /profiles to see your active profile, or restart pi to activate.', 'info');
}
