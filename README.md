# pi-profiles

Profile switching for [pi.dev](https://pi.dev) with [Bitwarden](https://bitwarden.com) integration. Automatically activates the right provider and API key based on your working directory — keeping work and personal contexts cleanly separated across machines.

## Install

```bash
pi install git:github.com/lynexer/pi-profiles
```

Then run `/profile list` inside pi to launch the setup wizard.

## What It Does

### Directory-based profile switching

pi-profiles maps directories to profiles. When you start a pi session, it checks your current working directory and activates the matching profile's provider and API key — no manual switching needed.

```
~/work/some-repo      →  work profile   (e.g. Anthropic with work API key)
~/personal/my-project →  personal profile (e.g. OpenAI with personal API key)
~/other               →  default profile (if configured)
```

### Bitwarden integration

API keys are fetched from your Bitwarden vault at session start and registered with pi's model runtime through `pi.registerProvider`. Keys are never written to disk and are never placed in `process.env` — they are held only in pi's in-memory provider configuration for the lifetime of the session and removed on shutdown. On machines where the vault is locked, pi-profiles prompts for your master password once per session.

Manual key entry is also supported if you prefer not to use Bitwarden.

### Multi-machine setup

Once your profiles are configured, setup on a new machine is just:

1. Install the extension
2. Run `/profile list` and re-enter your Bitwarden item names
3. Done — no environment variables, no shell config, no direnv

## Requirements

- [pi.dev](https://pi.dev) coding agent (1.4.0 or newer)
- A Bitwarden account — if using Bitwarden integration

## Commands

### `/profile`

Shows the currently active profile for your working directory.

```
Active profile: "work" (Anthropic)
```

### `/profile list`

Opens the profile manager — a TUI modal where you can:

- **Activate** a profile manually, overriding directory detection for the current session
- **Create** a new profile (provider, API key, directory mappings)
- **Set or clear** the default profile used when no directory matches
- **Delete** an existing profile

## Configuration

Profiles are stored in `~/.pi/agent/profiles.json` and managed through `/profile list`. You can also edit the file directly if needed.

```json
{
  "profiles": {
    "work": {
      "provider": "Anthropic",
      "keys": {
        "anthropic": "bw://Work Anthropic Key"
      }
    },
    "personal": {
      "provider": "OpenAI",
      "keys": {
        "openai": "bw://Personal OpenAI Key"
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

For known providers, the `keys` entry uses pi's **provider id** (e.g. `anthropic`, `openai`). The `bw://` prefix tells pi-profiles to fetch that value from Bitwarden using the item name that follows. Literal key values are also accepted.

For custom (`other`) providers, the `keys` entry is an **environment variable name** (e.g. `MY_PROVIDER_KEY`), which pi-profiles injects via `process.env` as a fallback.

### Supported providers

All built-in pi providers are supported. The setup wizard pre-fills the provider id for known providers automatically.

<details>
<summary>View all supported providers</summary>

| Provider | Provider id |
| --- | --- |
| Anthropic | `anthropic` |
| OpenAI | `openai` |
| Azure OpenAI Responses | `azure` |
| Google Gemini | `google` |
| Mistral | `mistral` |
| Groq | `groq` |
| DeepSeek | `deepseek` |
| Cerebras | `cerebras` |
| xAI | `xai` |
| OpenRouter | `openrouter` |
| Vercel AI Gateway | `vercel-ai-gateway` |
| ZAI | `zai` |
| OpenCode Zen | `opencode` |
| OpenCode Go | `opencode-go` |
| Hugging Face | `huggingface` |
| Fireworks | `fireworks` |
| Kimi For Coding | `kimi-coding` |
| MiniMax | `minimax` |
| MiniMax (China) | `minimax-cn` |
| Xiaomi MiMo | `xiaomi` |
| Xiaomi MiMo Token Plan (China) | `xiaomi-token-plan-cn` |
| Xiaomi MiMo Token Plan (Amsterdam) | `xiaomi-token-plan-ams` |
| Xiaomi MiMo Token Plan (Singapore) | `xiaomi-token-plan-sgp` |

Cloud providers (Amazon Bedrock, Google Vertex AI) and OAuth subscription providers (ChatGPT Plus, Claude Pro/Max, GitHub Copilot) use more complex credential setups. For these, select `other` during profile creation and enter the relevant environment variable manually, or refer to the [pi providers docs](https://github.com/earendil-works/pi/blob/main/docs/providers.md).

</details>

Any provider not listed can be added by selecting `other` during setup and entering the environment variable name manually.

## Session Start Behaviour

pi-profiles registers credentials in two phases so pi sees the active provider as early as possible:

**At startup (extension factory):** pi-profiles resolves the profile for the launch directory and registers any keys it can obtain without prompting — literal keys and `bw://` keys from an already-unlocked vault. This makes pi's startup availability check and default-model selection see the provider, avoiding the "No models available" warning.

**At `session_start`:** pi-profiles re-resolves the profile for the current directory (longest match wins, falling back to `defaultProfile`), unlocks Bitwarden interactively if needed, and registers any remaining keys. This also handles directory switches.

In both phases, keys are registered via `pi.registerProvider(providerId, { apiKey })` (or injected into `process.env` for legacy/`other` providers). A notification confirms the active profile once the session starts.

If no config exists, pi-profiles prompts you to run `/profile list` to get started.

## Notes

- **Keys are memory-only** — nothing fetched from Bitwarden is written to disk. Provider registrations are removed and the Bitwarden session key and all fetched secrets are cleared on `session_shutdown`.
- **Stored credentials take precedence** — if you have signed in to a provider through pi's `/login` (OAuth/subscription), that stored credential wins over the profile's API key.
- **Custom TUI is not available at `session_start`** — the Bitwarden master password prompt during session start uses plain text input rather than the masked input used in `/profile list`. This is a pi lifecycle limitation.
- **Locked vault at startup** — when a `bw://` key's vault is locked when pi starts, the key can only be registered after the interactive unlock at `session_start`, so pi may briefly show "No models available" and default the model to "unknown" until then. Unlock the vault first (or use a literal key) to avoid this.
- **Local `.pi/settings.json` is unaffected** — pi-profiles only manages provider credentials. Project-level pi config still loads and merges as normal.
- **Longest directory match wins** — if both `~/work` and `~/work/client-a` are mapped to different profiles, opening a session inside `~/work/client-a` uses the more specific mapping.
- **Legacy configs keep working** — profiles whose `keys` use uppercase environment variable names (e.g. `ANTHROPIC_API_KEY`) are still injected via `process.env`. Re-create them through `/profile list` to use provider-id registration.
