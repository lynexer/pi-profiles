# pi-profiles

Profile switching for [pi.dev](https://pi.dev) with [Bitwarden](https://bitwarden.com) integration. Automatically activates the right provider and API keys based on your working directory — keeping work and personal contexts cleanly separated across machines.

## Install

```bash
pi install git:github.com/lynexer/pi-profiles
```

Then run `/profile list` inside pi to launch the setup wizard.

## What It Does

### Directory-based profile switching

pi-profiles maps directories to profiles. When you start a pi session, it checks your current working directory and automatically injects the right API keys into the environment — no manual switching needed.

```
~/work/some-repo      →  work profile   (e.g. Anthropic with work API key)
~/personal/my-project →  personal profile (e.g. OpenAI with personal API key)
~/other               →  default profile (if configured)
```

### Bitwarden integration

API keys are fetched directly from your Bitwarden vault at session start. Keys are never stored on disk — only held in memory for the lifetime of the pi process and cleared on shutdown. On machines where the vault is locked, pi-profiles prompts for your master password once per session.

Manual key entry is also supported if you prefer not to use Bitwarden.

### Multi-machine setup

Once your profiles are configured, setup on a new machine is just:

1. Install the extension
2. Run `/profile list` and re-enter your Bitwarden item names
3. Done — no environment variables, no shell config, no direnv

## Requirements

- [pi.dev](https://pi.dev) coding agent
- A Bitwarden account — if using Bitwarden integration

## Commands

### `/profile`

Shows the currently active profile for your working directory.

```
Active profile: "work" (anthropic)
```

### `/profile list`

Opens the profile manager — a TUI modal where you can:

- **Activate** a profile manually, overriding directory detection for the current session
- **Create** a new profile (provider, API key, directory mappings)
- **Set or clear** the default profile used when no directory matches
- **Delete** an existing profile

## Configuration

Profiles are stored in `~/.pi/agent/profiles.json` and managed entirely through `/profile list`. You can also edit the file directly if needed.

```json
{
  "profiles": {
    "work": {
      "provider": "anthropic",
      "keys": {
        "ANTHROPIC_API_KEY": "bw://Work Anthropic Key"
      }
    },
    "personal": {
      "provider": "openai",
      "keys": {
        "OPENAI_API_KEY": "bw://Personal OpenAI Key"
      }
    }
  },
  "directories": {
    "~/work": "work",
    "~/personal": "personal"
  },
  "defaultProfile": "personal"
}
```

The `bw://` prefix tells pi-profiles to fetch that value from Bitwarden using the item name that follows. Literal key values are also accepted.

### Supported providers

All built-in pi providers are supported. The setup wizard pre-fills the environment variable name for known providers automatically.

<details>
<summary>View all supported providers</summary>

| Provider | Environment Variable |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY` |
| Hugging Face | `HF_TOKEN` |
| Fireworks | `FIREWORKS_API_KEY` |
| Kimi For Coding | `KIMI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| MiniMax (China) | `MINIMAX_CN_API_KEY` |
| Xiaomi MiMo | `XIAOMI_API_KEY` |
| ZAI | `ZAI_API_KEY` |
| OpenCode Zen / Go | `OPENCODE_API_KEY` |

Cloud providers (Amazon Bedrock, Google Vertex AI, Azure) and OAuth subscription providers (ChatGPT Plus, Claude Pro/Max, GitHub Copilot) use more complex credential setups. For these, select `other` during profile creation and enter the relevant environment variable manually, or refer to the [pi providers docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md).

</details>

Any provider not listed can be added by selecting `other` during setup and entering the environment variable name manually.

## Session Start Behaviour

At `session_start`, pi-profiles:

1. Resolves the active profile by matching `cwd` against configured directories (longest match wins)
2. Falls back to `defaultProfile` if no directory matches
3. Fetches any `bw://` keys from the Bitwarden vault (prompting to unlock if needed)
4. Injects resolved keys into `process.env` so pi's provider resolution picks them up
5. Emits a notification confirming the active profile

If no config exists, pi-profiles prompts you to run `/profile list` to get started.

## Notes

- **Keys are memory-only** — nothing fetched from Bitwarden is written to disk. The Bitwarden session key and all fetched secrets are cleared on `session_shutdown`.
- **Custom TUI is not available at `session_start`** — the Bitwarden master password prompt during session start uses plain text input rather than the masked input used in `/profile list`. This is a pi lifecycle limitation.
- **Local `.pi/settings.json` is unaffected** — pi-profiles only manages environment variables and provider selection. Project-level pi config still loads and merges as normal.
- **Longest directory match wins** — if both `~/work` and `~/work/client-a` are mapped to different profiles, opening a session inside `~/work/client-a` uses the more specific mapping.