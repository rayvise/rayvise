# Model Provider Compliance

Raypaste direct mode intentionally exposes a provider-scoped model list instead of one shared catalog.

## Current direct-mode behavior

- Each provider owns its own allowed-model registry and display order.
- The registry lives in `src/services/llm/models.ts`.
- The Settings model picker only shows models returned by the active provider's registry entry.
- Providers may expose overlapping model ids with provider-specific labels.

## How filtering works

- When the active provider changes, Raypaste keeps the current model only if that provider explicitly allows it.
- If the selected model is not allowed for the newly selected provider, Raypaste automatically falls back to that provider's default model.
- When persisted settings are loaded, Raypaste normalizes both the provider and model against the current registry.
- Label lookup is provider-aware so shared model ids can still render provider-specific names in the UI.

## Why this exists

- Provider access is not uniform across OpenRouter, Cerebras, and OpenAI.
- A shared model list makes it easy to save an invalid provider/model combination and fail later at request time.
- Provider-scoped filtering keeps the UI compliant with the models Raypaste currently provisions and validates.

## Updating the registry

When provider access changes:

1. Update `src/services/llm/models.ts`.
2. Add or remove any provider transport logic needed under `src/services/llm/`.
3. Update `docs/MODEL_PROVIDER_COMPLIANCE.md` if the registry behavior, normalization rules, or provider-specific transport assumptions change.
4. Extend the tests in `src/services/llm/models.test.ts` if the provider list or ordering changes.
