import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { normalize, resolve } from 'node:path';
import type { Profile, ProfilesConfig } from './types.js';

export const CONFIG_PATH = resolve(homedir(), '.pi', 'agent', 'profiles.json');

export class ConfigManager {
    private config: ProfilesConfig | null = null;

    async load(): Promise<ProfilesConfig> {
        try {
            const raw = await readFile(CONFIG_PATH, 'utf8');

            this.config = JSON.parse(raw) as ProfilesConfig;
        } catch {
            this.config = { profiles: {}, directories: {} };
        }

        return this.config;
    }

    async save(): Promise<void> {
        if (!this.config) return;

        await mkdir(resolve(homedir(), '.pi', 'agent'), { recursive: true });
        await writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
    }

    get(): ProfilesConfig {
        return this.config ?? { profiles: {}, directories: {} };
    }

    exists(): boolean {
        return existsSync(CONFIG_PATH);
    }

    addProfile(name: string, profile: Profile): void {
        if (!this.config) return;

        this.config.profiles[name] = profile;
    }

    deleteProfile(name: string): void {
        if (!this.config) return;

        delete this.config?.profiles[name];

        for (const [dir, pName] of Object.entries(this.config.directories)) {
            if (pName === name) delete this.config?.directories[dir];
        }

        if (this.config?.defaultProfile === name) {
            delete this.config?.defaultProfile;
        }
    }

    addDirectory(path: string, profileName: string): void {
        if (!this.config) return;

        this.config.directories[path] = profileName;
    }

    setDefault(profileName: string | undefined): void {
        if (!this.config) return;

        this.config.defaultProfile = profileName;
    }

    resolveProfile(cwd: string): { name: string; profile: Profile } | undefined {
        const config = this.get();
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
}
