import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LLMProvider } from "#/services/llm/types";
import {
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_DIRECT_PROVIDER,
  getDefaultModelForProvider,
  isLLMProvider,
  normalizeLLMProvider,
  normalizeProviderModel,
} from "#/services/llm/models";
import { LLM_PROVIDER } from "#/services/llm/types";

export type ThemeMode = "light" | "dark" | "auto";
export type ProviderModelSelections = Partial<Record<LLMProvider, string>>;

function createDefaultModelSelections(): ProviderModelSelections {
  return {
    [LLM_PROVIDER.OpenRouter]: getDefaultModelForProvider(
      LLM_PROVIDER.OpenRouter,
    ),
    [LLM_PROVIDER.Cerebras]: getDefaultModelForProvider(LLM_PROVIDER.Cerebras),
    [LLM_PROVIDER.OpenAI]: getDefaultModelForProvider(LLM_PROVIDER.OpenAI),
    [LLM_PROVIDER.Local]: getDefaultModelForProvider(LLM_PROVIDER.Local),
  };
}

function normalizeModelSelections(
  value: unknown,
  legacyProvider: LLMProvider,
  legacyModel: unknown,
): ProviderModelSelections {
  const defaults = createDefaultModelSelections();
  const raw =
    value && typeof value === "object"
      ? (value as Partial<Record<string, unknown>>)
      : {};

  const selections: ProviderModelSelections = {};
  for (const provider of Object.values(LLM_PROVIDER) as LLMProvider[]) {
    selections[provider] = normalizeProviderModel(provider, raw[provider]);
  }

  selections[legacyProvider] = normalizeProviderModel(
    legacyProvider,
    legacyModel ?? raw[legacyProvider] ?? defaults[legacyProvider],
  );

  return selections;
}

function normalizeLocalModelOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

interface SettingsState {
  mode: "direct" | "api";
  provider: LLMProvider;
  openrouterApiKey: string;
  cerebrasApiKey: string;
  openaiApiKey: string;
  localBaseUrl: string;
  localApiKey: string;
  localModelOptions: string[];
  modelSelections: ProviderModelSelections;
  model: string;
  reviewMode: boolean;
  themeMode: ThemeMode;
  setMode: (mode: "direct" | "api") => void;
  setProvider: (provider: LLMProvider) => void;
  setOpenrouterApiKey: (key: string) => void;
  setCerebrasApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
  setLocalBaseUrl: (baseUrl: string) => void;
  setLocalApiKey: (key: string) => void;
  setLocalModelOptions: (models: string[]) => void;
  setModel: (model: string) => void;
  setReviewMode: (reviewMode: boolean) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mode: "direct",
      provider: DEFAULT_DIRECT_PROVIDER,
      openrouterApiKey: "",
      cerebrasApiKey: "",
      openaiApiKey: "",
      localBaseUrl: DEFAULT_LOCAL_BASE_URL,
      localApiKey: "",
      localModelOptions: [],
      modelSelections: createDefaultModelSelections(),
      model: normalizeProviderModel(
        DEFAULT_DIRECT_PROVIDER,
        "openai/gpt-oss-120b",
      ),
      reviewMode: false,
      themeMode: "auto",
      setMode: (mode) => set({ mode }),
      setProvider: (provider) =>
        set((state) => ({
          provider,
          model: normalizeProviderModel(
            provider,
            state.modelSelections[provider],
          ),
        })),
      setOpenrouterApiKey: (openrouterApiKey) => set({ openrouterApiKey }),
      setCerebrasApiKey: (cerebrasApiKey) => set({ cerebrasApiKey }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setLocalBaseUrl: (localBaseUrl) => set({ localBaseUrl }),
      setLocalApiKey: (localApiKey) => set({ localApiKey }),
      setLocalModelOptions: (localModelOptions) =>
        set({
          localModelOptions: normalizeLocalModelOptions(localModelOptions),
        }),
      setModel: (model) =>
        set((state) => ({
          model: normalizeProviderModel(state.provider, model),
          modelSelections: {
            ...state.modelSelections,
            [state.provider]: normalizeProviderModel(state.provider, model),
          },
        })),
      setReviewMode: (reviewMode) => set({ reviewMode }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "rayvise-settings",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState> & {
          reviewMode?: unknown;
          provider?: unknown;
          model?: unknown;
          modelSelections?: unknown;
          localBaseUrl?: unknown;
          localApiKey?: unknown;
          localModelOptions?: unknown;
        };
        const provider = isLLMProvider(persisted.provider)
          ? persisted.provider
          : normalizeLLMProvider(persisted.provider);
        const modelSelections = normalizeModelSelections(
          persisted.modelSelections,
          provider,
          persisted.model,
        );

        return {
          ...currentState,
          ...persisted,
          provider,
          localBaseUrl:
            typeof persisted.localBaseUrl === "string" &&
            persisted.localBaseUrl.trim()
              ? persisted.localBaseUrl
              : currentState.localBaseUrl,
          localApiKey:
            typeof persisted.localApiKey === "string"
              ? persisted.localApiKey
              : currentState.localApiKey,
          localModelOptions: normalizeLocalModelOptions(
            persisted.localModelOptions,
          ),
          modelSelections,
          model: normalizeProviderModel(provider, modelSelections[provider]),
          reviewMode:
            typeof persisted.reviewMode === "boolean"
              ? persisted.reviewMode
              : currentState.reviewMode,
        };
      },
    },
  ),
);
