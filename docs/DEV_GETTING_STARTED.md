# Developers Getting Started Guide

If you have never run a Tauri app locally before check that you have the [prerequisites here](https://v2.tauri.app/start/prerequisites/)

## Running Rayvise Locally

```bash
# Install dependencies
pnpm install
# Run Rayvise frontend and backend
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

Rayvise offers direct-to-provider completions today and will support **rayvise-api** in the future.
You can configure your options in the app settings.

### Direct to Provider

You can set one or more of [OpenRouter](https://openrouter.ai/), [Cerebras](https://www.cerebras.ai/), or [OpenAI](https://platform.openai.com/) API keys and select which one you want to route your requests through. You can also choose **Local** to route requests to run LLMs locally on a loopback OpenAI-compatible server like [Ollama](https://ollama.com/).

**(BYOK Privacy-first option):** Your prompt, inputs, and outputs do not pass through Rayvise's servers and thus are not stored anywhere in our database. Your request goes from the app to the provider you selected and returns directly back to you. Please review each provider's privacy policies on how they will interact with your personal/business data.

Rayvise filters the model picker by provider so only models allowed for that direct connection are shown. See [MODEL_PROVIDER_COMPLIANCE.md](MODEL_PROVIDER_COMPLIANCE.md) for the filtering and normalization rules.

### Running Rayvise with a Local LLM

The Local provider defaults to Ollama's OpenAI-compatible endpoint:

You can download the model weights and then run rayvise by running:

```bash
ollama pull llama3.2
pnpm tauri dev
```

Then open Rayvise Settings, select **Direct to Provider** → **Local**, keep `http://localhost:11434/v1`, and click **Refresh models**. Ollama documents this OpenAI-compatible base URL, `/v1/chat/completions`, streaming support, `/v1/models`, and the ignored API-key convention in its [OpenAI compatibility docs](https://docs.ollama.com/openai).

For implementation details, local endpoint validation, reasoning-output handling, and hardware guidance, see [LOCAL_LLM.md](LOCAL_LLM.md).

Local model performance depends heavily on memory. On Apple Silicon, CPU and GPU share unified memory, so available RAM and model size are usually the practical bottleneck. Ollama's FAQ documents how loaded models use system memory or VRAM, how `ollama ps` reports loaded model size/processor placement, and how context/concurrency settings increase memory use. Apple documents unified-memory behavior in Metal's [`MTLDevice.hasUnifiedMemory`](https://developer.apple.com/documentation/metal/mtldevice/hasunifiedmemory), and Ollama model-library pages such as [Llama 3.2](https://ollama.com/library/llama3.2) and [Qwen3](https://ollama.com/library/qwen3) show how parameter count and model download size vary.

### Rayvise API

After the main Rayvise app functionalities are built; and running the app locally/privately is in a good spot, the internal Rayvise team will begin building out harnesses to improve our universal AI experience bringing fast, flexible, and most importantly useful AI completions to everyone's workflows.

## Contributing

Interested in adding a feature, fixing a bug, or adding documentation you wish you had? See our [contributing guide](docs/CONTRIBUTING.md).
