import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LLMProvider } from "#/services/llm/types";
import {
  DEFAULT_DIRECT_PROVIDER,
  normalizeLLMProvider,
  normalizeProviderModel,
} from "#/services/llm/models";

export type ThemeMode = "light" | "dark" | "auto";

interface SettingsState {
  mode: "direct" | "api";
  provider: LLMProvider;
  openrouterApiKey: string;
  cerebrasApiKey: string;
  openaiApiKey: string;
  model: string;
  reviewMode: boolean;
  themeMode: ThemeMode;
  setMode: (mode: "direct" | "api") => void;
  setProvider: (provider: LLMProvider) => void;
  setOpenrouterApiKey: (key: string) => void;
  setCerebrasApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
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
          model: normalizeProviderModel(provider, state.model),
        })),
      setOpenrouterApiKey: (openrouterApiKey) => set({ openrouterApiKey }),
      setCerebrasApiKey: (cerebrasApiKey) => set({ cerebrasApiKey }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setModel: (model) =>
        set((state) => ({
          model: normalizeProviderModel(state.provider, model),
        })),
      setReviewMode: (reviewMode) => set({ reviewMode }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "raypaste-settings",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState> & {
          reviewMode?: unknown;
        };
        const provider = normalizeLLMProvider(persisted.provider);

        return {
          ...currentState,
          ...persisted,
          provider,
          model: normalizeProviderModel(provider, persisted.model),
          reviewMode:
            typeof persisted.reviewMode === "boolean"
              ? persisted.reviewMode
              : currentState.reviewMode,
        };
      },
    },
  ),
);
