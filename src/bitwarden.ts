import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getBwBin(): string {
    const require = createRequire(import.meta.url);

    return require.resolve('@bitwarden/cli/build/bw');
}

async function exec(args: string[]): Promise<{ code: number; stdout: string }> {
    try {
        const { stdout } = await execFileAsync(process.execPath, [getBwBin(), ...args]);

        return { code: 0, stdout };
        // biome-ignore lint/suspicious/noExplicitAny: Catch clause variable type annotation must be 'any' or 'unknown' if specified.
    } catch (err: any) {
        return { code: err.code ?? 1, stdout: err.stdout ?? '' };
    }
}

export class BitwardenClient {
    private sessionKey: string | undefined;
    private cache = new Map<string, string>();

    async checkStatus(): Promise<'unlocked' | 'locked' | 'error'> {
        if (this.sessionKey) return 'unlocked';

        try {
            const result = await exec(['status', '--raw']);

            return result.stdout.includes('unlocked') ? 'unlocked' : 'locked';
        } catch {
            return 'error';
        }
    }

    async unlockWithKey(password: string): Promise<boolean> {
        const result = await exec(['unlock', password, '--raw']);

        if (result.code !== 0) return false;

        this.sessionKey = result.stdout.trim();

        return true;
    }

    async getSecret(itemName: string): Promise<string | undefined> {
        if (this.cache.has(itemName)) return this.cache.get(itemName);
        if (!this.sessionKey) return undefined;

        const result = await exec(['get', 'password', itemName, '--session', this.sessionKey]);

        if (result.code !== 0) return undefined;

        const secret = result.stdout.trim();

        this.cache.set(itemName, secret);

        return secret;
    }

    clearSession(): void {
        this.sessionKey = undefined;
        this.cache.clear();
    }
}
