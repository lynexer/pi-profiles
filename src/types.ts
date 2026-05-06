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
    Anthropic: 'ANTHROPIC_API_KEY',
    'Azure OpenAI Responses': 'AZURE_OPENAI_API_KEY',
    OpenAI: 'OPENAI_API_KEY',
    DeepSeek: 'DEEPSEEK_API_KEY',
    'Google Gemini': 'GEMINI_API_KEY',
    Mistral: 'MISTRAL_API_KEY',
    Groq: 'GROQ_API_KEY',
    Cerebras: 'CEREBRAS_API_KEY',
    xAI: 'XAI_API_KEY',
    OpenRouter: 'OPENROUTER_API_KEY',
    'Vercel AI Gateway': 'AI_GATEWAY_API_KEY',
    ZAI: 'ZAI_API_KEY',
    'OpenCode Zen': 'OPENCODE_API_KEY',
    'OpenCode Go': 'OPENCODE_API_KEY',
    'Hugging Face': 'HF_TOKEN',
    Fireworks: 'FIREWORKS_API_KEY',
    'Kimi For Coding': 'KIMI_API_KEY',
    MiniMax: 'MINIMAX_API_KEY',
    'MiniMax (China)': 'MINIMAX_CN_API_KEY',
    'Xiaomi MiMo': 'XIAOMI_API_KEY',
    'Xiaomi MiMo Token Plan (China)': 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    'Xiaomi MiMo Token Plan (Amsterdam)': 'XIAOMI_TOKEN_PLAN_AMS_API_KEY',
    'Xiaomi MiMo Token Plan (Singapore)': 'XIAOMI_TOKEN_PLAN_SGP_API_KEY'
} as const;
