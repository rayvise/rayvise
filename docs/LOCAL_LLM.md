# Local LLM Integration

Rayvise supports a **Local** direct provider for Ollama-compatible OpenAI APIs. This lets the app send completion requests to a loopback LLM server instead of an external provider.

## What Rayvise Calls

Rayvise's Local provider is designed around Ollama's OpenAI-compatible API:

- Default base URL: `http://localhost:11434/v1`
- Chat streaming endpoint: `POST /v1/chat/completions`
- Model discovery endpoint: `GET /v1/models`
- Default model name: `llama3.2`

Ollama documents the OpenAI-compatible base URL as `http://localhost:11434/v1/`, notes that OpenAI client API keys are required by some tooling but ignored by Ollama, supports streaming chat completions, exposes `/v1/models`, and supports reasoning controls such as `reasoning_effort: "none"` for thinking models. See the official [Ollama OpenAI compatibility docs](https://docs.ollama.com/openai) and [Ollama API OpenAI compatibility docs](https://docs.ollama.com/api/openai-compatibility).

Rayvise sends Local requests through Rust commands instead of browser `fetch` so the desktop app can:

- avoid webview CSP/CORS surprises for local servers;
- enforce loopback-only URLs before any request is sent;
- stream chunks back into the existing review and instant-mode pipelines;
- cancel in-flight requests through the same `AbortSignal` path used by external providers.

## Setup

1. Install Ollama from the official [Ollama download page](https://ollama.com/download).
2. Pull a local model:

   ```bash
   ollama pull llama3.2
   ```

3. Start Rayvise with `pnpm tauri dev`.
4. Open Settings, choose **Direct to Provider**, then choose **Local**.
5. Leave the base URL as `http://localhost:11434/v1` for default Ollama.
6. Leave the optional token blank for Ollama.
7. Click **Refresh models** or type a model name manually.

Rayvise does not install Ollama, launch the Ollama server, or pull models. It only connects to an already-running local OpenAI-compatible endpoint.

## Security Boundary

Local provider URLs are intentionally restricted to loopback hosts:

- `localhost`
- `127.0.0.1`
- `::1`

The Rust validator rejects non-HTTP(S) schemes, credentials in the URL, non-loopback hosts, and paths other than empty or `/v1`. This keeps the Local provider aligned with the "fully local LLM call" promise and prevents the Local setting from silently becoming an arbitrary remote network client.

The privacy boundary is specific to LLM calls and model discovery. Other Rayvise features keep their existing behavior.

## Reasoning Output

Rayvise suppresses reasoning output for Local completions by default:

- request bodies include `reasoning_effort: "none"` and `reasoning: { "effort": "none" }`;
- streamed `<think>...</think>` blocks are stripped before review display, instant writeback, and history save.

This is intentional because Rayvise writes model output into user-selected app text. Hidden reasoning from thinking models should not leak into the replacement text.

## Hardware Constraints

Local inference is constrained by memory capacity and model size.

Apple Silicon Macs use unified memory, meaning the GPU can share memory with the CPU. Apple's Metal documentation describes `hasUnifiedMemory` as indicating that the GPU shares all of its memory with the CPU, and Apple Mac technical specs list unified-memory capacities and memory bandwidth for Apple Silicon models. See Apple Developer's [`MTLDevice.hasUnifiedMemory`](https://developer.apple.com/documentation/metal/mtldevice/hasunifiedmemory) and Apple Support's [MacBook Air M4 tech specs](https://support.apple.com/en-us/122209) or [Mac Studio 2025 tech specs](https://support.apple.com/en-us/122211).

That unified memory pool is still finite. Running a local model competes with macOS, Rayvise, the target app, browser tabs, and any other workloads. Larger models and larger context windows use more memory:

- Ollama's FAQ explains that model loading and concurrency depend on available system memory or VRAM, and that parallel requests multiply context allocation through `OLLAMA_NUM_PARALLEL * OLLAMA_CONTEXT_LENGTH`.
- Ollama's FAQ also recommends `ollama ps` to inspect loaded model size and whether a model is running on CPU, GPU, or split CPU/GPU.
- The Ollama model library shows concrete model-size differences: `llama3.2` defaults to a 3B model around 2.0GB, while Qwen3 variants range from small sub-1GB models to 14B/30B/235B variants listed at much larger download sizes.

Start with small models on low-memory machines:

```bash
ollama pull llama3.2:1b
ollama pull llama3.2
```

Use `ollama ps` while Rayvise is making requests to see what is loaded and where. If completions are slow, fail to load, or cause memory pressure, choose a smaller model, reduce context size in Ollama, stop other memory-heavy apps, or run on a Mac with more unified memory.

References:

- [Ollama FAQ: memory, `ollama ps`, context, and concurrency](https://docs.ollama.com/faq)
- [Ollama Llama 3.2 model library](https://ollama.com/library/llama3.2)
- [Ollama Qwen3 model library](https://ollama.com/library/qwen3)
