export interface Profile {
    provider: string;
    keys: Record<string, string>;
}

export interface ProfilesConfig {
    profiles: Record<string, Profile>;
    directories: Record<string, string>;
    defaultProfile?: string;
}

export type ProfileAction =
    | { action: 'activate'; name: string }
    | { action: 'new' }
    | { action: 'delete'; name: string }
    | null;

export const KNOWN_PROVIDERS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    groq: 'GROQ_API_KEY'
} as const;
