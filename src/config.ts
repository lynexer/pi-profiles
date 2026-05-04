import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface Profile {
    provider: string;
    model: string;
    keys: Record<string, string>;
}

export interface ProfilesConfig {
    profiles: Record<string, Profile>;
    directories: Record<string, string>;
    defaultProfile?: string;
}

export const CONFIG_PATH = resolve(homedir(), '.pi', 'agent', 'profiles.json');

export async function loadConfig(): Promise<ProfilesConfig | undefined> {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(raw) as ProfilesConfig;
    } catch {
        return undefined;
    }
}

export async function saveConfig(config: ProfilesConfig): Promise<void> {
    await mkdir(resolve(homedir(), '.pi', 'agent'), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export function configExists(): boolean {
    return existsSync(CONFIG_PATH);
}
