import { useSettingsStore } from "#/stores";
import { openrouterClient } from "./openrouter";
import { cerebrasClient } from "./cerebras";
import { openaiClient } from "./openai";
import { raypasteApiClient } from "./raypaste-api";
import { dryRunClient } from "./dryRun";
import type { LLMClient } from "./types";
import { LLM_PROVIDER } from "./types";

export const DRY_RUN = import.meta.env.VITE_DRY_RUN === "true";

export function getLLMClient(): LLMClient {
  if (DRY_RUN) {
    return dryRunClient;
  }

  const { mode, provider } = useSettingsStore.getState();
  if (mode === "api") {
    return raypasteApiClient;
  }

  switch (provider) {
    case LLM_PROVIDER.Cerebras:
      return cerebrasClient;
    case LLM_PROVIDER.OpenAI:
      return openaiClient;
    case LLM_PROVIDER.OpenRouter:
    default:
      return openrouterClient;
  }
}

export function getApiKey(): string {
  if (DRY_RUN) {
    return "dry-run";
  }

  const { provider, openrouterApiKey, cerebrasApiKey, openaiApiKey } =
    useSettingsStore.getState();

  switch (provider) {
    case LLM_PROVIDER.Cerebras:
      return cerebrasApiKey;
    case LLM_PROVIDER.OpenAI:
      return openaiApiKey;
    case LLM_PROVIDER.OpenRouter:
    default:
      return openrouterApiKey;
  }
}

export type { LLMClient, LLMRequest, LLMMessage } from "./types";
