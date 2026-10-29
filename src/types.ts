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
    | { action: 'setDefault'; name: string }
    | { action: 'clearDefault' }
    | null;

export const KNOWN_PROVIDERS: Record<string, string> = {
    Anthropic: 'anthropic',
    'Azure OpenAI Responses': 'azure',
    OpenAI: 'openai',
    DeepSeek: 'deepseek',
    'Google Gemini': 'google',
    Mistral: 'mistral',
    Groq: 'groq',
    Cerebras: 'cerebras',
    xAI: 'xai',
    OpenRouter: 'openrouter',
    'Vercel AI Gateway': 'vercel-ai-gateway',
    ZAI: 'zai',
    'OpenCode Zen': 'opencode',
    'OpenCode Go': 'opencode-go',
    'Hugging Face': 'huggingface',
    Fireworks: 'fireworks',
    'Kimi For Coding': 'kimi-coding',
    MiniMax: 'minimax',
    'MiniMax (China)': 'minimax-cn',
    'Xiaomi MiMo': 'xiaomi',
    'Xiaomi MiMo Token Plan (China)': 'xiaomi-token-plan-cn',
    'Xiaomi MiMo Token Plan (Amsterdam)': 'xiaomi-token-plan-ams',
    'Xiaomi MiMo Token Plan (Singapore)': 'xiaomi-token-plan-sgp'
} as const;

const KNOWN_PROVIDER_IDS = Object.values(KNOWN_PROVIDERS) as string[];

export function isKnownProviderId(key: string): boolean {
    return KNOWN_PROVIDER_IDS.includes(key);
}
