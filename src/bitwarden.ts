import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getBwBin(): string {
    const require = createRequire(import.meta.url);
    return require.resolve('@bitwarden/cli/build/bw');
}

let sessionKey: string | undefined;
const cache = new Map<string, string>();

async function exec(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [getBwBin(), ...args]);
        return { code: 0, stdout, stderr };
        // biome-ignore lint/suspicious/noExplicitAny: Catch clause variable type annotation must be 'any' or 'unknown' if specified.
    } catch (err: any) {
        return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
}

export async function unlock(
    promptFn: (title: string, placeholder: string) => Promise<string | undefined>
): Promise<boolean> {
    if (sessionKey) return true;

    const status = await exec(['status', '--raw']);
    if (status.stdout.includes('unlocked')) return true;

    const password = await promptFn('Bitwarden master password', 'Unlock your vault');
    if (!password) return false;

    const result = await exec(['unlock', password, '--raw']);
    if (result.code !== 0) return false;

    sessionKey = result.stdout.trim();
    return true;
}

export async function getSecret(itemName: string): Promise<string | undefined> {
    if (cache.has(itemName)) return cache.get(itemName);
    if (!sessionKey) return undefined;

    const result = await exec(['get', 'password', itemName, '--session', sessionKey]);
    if (result.code !== 0) return undefined;

    const secret = result.stdout.trim();
    cache.set(itemName, secret);
    return secret;
}

export function clearSession() {
    sessionKey = undefined;
    cache.clear();
}
