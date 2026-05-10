import { LLM_PROVIDER, type LLMProvider } from "./types";

export interface ProviderModelOption {
  value: string;
  label: string;
}

export const DIRECT_PROVIDER_OPTIONS = [
  LLM_PROVIDER.OpenRouter,
  LLM_PROVIDER.Cerebras,
  LLM_PROVIDER.OpenAI,
  LLM_PROVIDER.Local,
] as const satisfies readonly LLMProvider[];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  [LLM_PROVIDER.OpenRouter]: "OpenRouter",
  [LLM_PROVIDER.Cerebras]: "Cerebras",
  [LLM_PROVIDER.OpenAI]: "OpenAI",
  [LLM_PROVIDER.Local]: "Local",
};

const PROVIDER_MODEL_OPTIONS: Record<LLMProvider, ProviderModelOption[]> = {
  [LLM_PROVIDER.OpenRouter]: [
    { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
  ],
  [LLM_PROVIDER.Cerebras]: [
    { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    {
      value: "meta-llama/llama-3.1-8b-instruct",
      label: "Llama 3.1 8B Instruct",
    },
  ],
  [LLM_PROVIDER.OpenAI]: [
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { value: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  [LLM_PROVIDER.Local]: [{ value: "llama3.2", label: "llama3.2" }],
};

export const DEFAULT_DIRECT_PROVIDER = LLM_PROVIDER.OpenRouter;
export const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_LOCAL_MODEL = "llama3.2";

export function isLLMProvider(value: unknown): value is LLMProvider {
  return (
    typeof value === "string" &&
    Object.values(LLM_PROVIDER).includes(value as LLMProvider)
  );
}

export function normalizeLLMProvider(value: unknown): LLMProvider {
  return isLLMProvider(value) ? value : DEFAULT_DIRECT_PROVIDER;
}

export function getProviderLabel(provider: LLMProvider): string {
  return PROVIDER_LABELS[provider];
}

export function getProviderModelOptions(
  provider: LLMProvider,
): ProviderModelOption[] {
  return PROVIDER_MODEL_OPTIONS[provider];
}

export function getModelLabel(provider: LLMProvider, model: string): string {
  return (
    PROVIDER_MODEL_OPTIONS[provider].find((option) => option.value === model)
      ?.label ?? model
  );
}

export function getDefaultModelForProvider(provider: LLMProvider): string {
  switch (provider) {
    case LLM_PROVIDER.OpenRouter:
      return "openai/gpt-oss-120b";
    case LLM_PROVIDER.Cerebras:
      return "openai/gpt-oss-120b";
    case LLM_PROVIDER.OpenAI:
      return "gpt-5-nano";
    case LLM_PROVIDER.Local:
      return DEFAULT_LOCAL_MODEL;
    default:
      return (PROVIDER_MODEL_OPTIONS[provider][0] as ProviderModelOption).value;
  }
}

export function isModelAllowedForProvider(
  provider: LLMProvider,
  model: string,
): boolean {
  if (provider === LLM_PROVIDER.Local) {
    return model.trim().length > 0;
  }

  return PROVIDER_MODEL_OPTIONS[provider].some(
    (option) => option.value === model,
  );
}

export function normalizeProviderModel(
  provider: LLMProvider,
  model: unknown,
): string {
  if (provider === LLM_PROVIDER.Local) {
    const trimmed = typeof model === "string" ? model.trim() : "";
    return trimmed || getDefaultModelForProvider(provider);
  }

  return typeof model === "string" && isModelAllowedForProvider(provider, model)
    ? model
    : getDefaultModelForProvider(provider);
}

export function getProviderAccessDescription(provider: LLMProvider): string {
  switch (provider) {
    case LLM_PROVIDER.OpenRouter:
      return "Select from models currently supported for OpenRouter direct mode.";
    case LLM_PROVIDER.Cerebras:
      return "Select from models currently validated against the Cerebras Inference API.";
    case LLM_PROVIDER.OpenAI:
      return "Select from supported OpenAI models.";
    case LLM_PROVIDER.Local:
      return "Use an Ollama-compatible local OpenAI endpoint. Model names can be selected from discovery or typed manually.";
  }
}
