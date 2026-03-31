# Developers Getting Started Guide

If you have never run a Tauri app locally before check that you have the [prerequisites here](https://v2.tauri.app/start/prerequisites/)

## Running Raypaste Locally

```bash
# Install dependencies
pnpm install
# Run Raypaste frontend and backend
pnpm tauri dev
```

## Dry Run Mode (Local Development)

To test the app without making real LLM API calls, enable dry run mode:

```bash
# Copy the example config
cp .env.local.example .env.local

# Set VITE_DRY_RUN=true in .env.local
# Then run as normal
pnpm tauri dev
```

When dry run is active:

- LLM calls are skipped entirely (no API costs)
- Selected text is echoed back with a `[DRY RUN]` prefix
- API key is not required

## API Keys and LLM Connections

Raypaste offers direct-to-provider completions today and will support **raypaste-api** in the future.
You can configure your options in the app settings.

### Direct to Provider

You can set one or more of [OpenRouter](https://openrouter.ai/), [Cerebras](https://www.cerebras.ai/), or [OpenAI](https://platform.openai.com/) API keys and select which one you want to route your requests through.

**(Privacy-first):** Your prompt, inputs, and outputs do not pass through Raypaste's servers and are not stored anywhere in our database. Your request goes from the app to the provider you selected and returns directly back to you. Please review each provider's privacy policies on how they will interact with your personal/business data.

Raypaste filters the model picker by provider so only the models currently provisioned and validated for that direct connection are shown. See [MODEL_PROVIDER_COMPLIANCE.md](MODEL_PROVIDER_COMPLIANCE.md) for the current matrix.

### Raypaste API

After the main Raypaste app functionalities are built; and running the app locally/privately is in a good spot, the internal Raypaste team will begin building out harnesses to improve our universal AI experience bringing fast, flexible, and most importantly useful AI completions to everyone's workflows.

## Contributing

Interested in adding a feature, fixing a bug, or adding documentation you wish you had? See our [contributing guide](docs/CONTRIBUTING.md).
