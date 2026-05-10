import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_BASE_URL } from "#/services/llm/models";
import { LLM_PROVIDER } from "#/services/llm/types";
import { useSettingsStore } from "./settingsStore";

function resetSettingsStore() {
  useSettingsStore.setState({
    mode: "direct",
    provider: LLM_PROVIDER.OpenRouter,
    openrouterApiKey: "",
    cerebrasApiKey: "",
    openaiApiKey: "",
    localBaseUrl: DEFAULT_LOCAL_BASE_URL,
    localApiKey: "",
    localModelOptions: [],
    modelSelections: {
      [LLM_PROVIDER.OpenRouter]: "openai/gpt-oss-120b",
      [LLM_PROVIDER.Cerebras]: "openai/gpt-oss-120b",
      [LLM_PROVIDER.OpenAI]: "gpt-5-nano",
      [LLM_PROVIDER.Local]: "llama3.2",
    },
    model: "openai/gpt-oss-120b",
    reviewMode: false,
    themeMode: "auto",
  });
}

describe("settingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSettingsStore();
  });

  it("remembers selected models per provider", () => {
    useSettingsStore.getState().setProvider(LLM_PROVIDER.OpenAI);
    useSettingsStore.getState().setModel("gpt-4o-mini");
    useSettingsStore.getState().setProvider(LLM_PROVIDER.Local);
    useSettingsStore.getState().setModel("custom:model");

    useSettingsStore.getState().setProvider(LLM_PROVIDER.OpenAI);
    expect(useSettingsStore.getState().model).toBe("gpt-4o-mini");

    useSettingsStore.getState().setProvider(LLM_PROVIDER.Local);
    expect(useSettingsStore.getState().model).toBe("custom:model");
  });

  it("migrates a legacy single model into the active provider selection", async () => {
    localStorage.setItem(
      "rayvise-settings",
      JSON.stringify({
        state: {
          provider: LLM_PROVIDER.OpenAI,
          model: "gpt-4o-mini",
        },
        version: 0,
      }),
    );

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().provider).toBe(LLM_PROVIDER.OpenAI);
    expect(useSettingsStore.getState().model).toBe("gpt-4o-mini");
    expect(
      useSettingsStore.getState().modelSelections[LLM_PROVIDER.OpenAI],
    ).toBe("gpt-4o-mini");
  });
});
