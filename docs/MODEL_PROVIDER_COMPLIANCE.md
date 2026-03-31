# Model Provider Compliance

Raypaste direct mode intentionally exposes a provider-scoped model list instead of one shared catalog.

## Current direct-mode model access

| Provider | Models shown in Raypaste | Notes |
| --- | --- | --- |
| OpenRouter | `openai/gpt-oss-120b` | Kept to the currently provisioned OpenRouter arrangement. |
| Cerebras | `openai/gpt-oss-120b`, `meta-llama/llama-3.1-8b-instruct` | Matches the models currently validated against Cerebras Inference. |
| OpenAI | `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | Scoped to the GPT-5 family currently enabled in Raypaste direct mode. |

## How filtering works

- The provider registry lives in `src/services/llm/models.ts`.
- Each direct provider declares its own allowed models and display order.
- When the active provider changes, Raypaste keeps the current model only if that provider explicitly allows it.
- If the selected model is not allowed for the newly selected provider, Raypaste automatically falls back to that provider's default model.
- The Settings model picker renders only the models returned by the active provider registry entry.

## Why this exists

- Provider access is not uniform across OpenRouter, Cerebras, and OpenAI.
- A shared model list makes it easy to save an invalid provider/model combination and fail later at request time.
- Provider-scoped filtering keeps the UI compliant with the models Raypaste currently provisions and validates.

## Updating the registry

When provider access changes:

1. Update `src/services/llm/models.ts`.
2. Add or remove any provider transport logic needed under `src/services/llm/`.
3. Update `docs/MODEL_PROVIDER_COMPLIANCE.md` so the documented matrix stays in sync with the UI.
4. Extend the tests in `src/services/llm/models.test.ts` if the provider list or ordering changes.
