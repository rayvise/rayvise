import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECT_PROVIDER,
  getDefaultModelForProvider,
  getModelLabel,
  getProviderModelOptions,
  normalizeLLMProvider,
  normalizeProviderModel,
} from "./models";
import { LLM_PROVIDER } from "./types";

describe("provider model registry", () => {
  it("filters OpenRouter models to the current provisioned set", () => {
    expect(getProviderModelOptions(LLM_PROVIDER.OpenRouter)).toEqual([
      { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
      {
        value: "meta-llama/llama-3.1-8b-instruct",
        label: "Llama 3.1 8B",
      },
    ]);
  });

  it("filters Cerebras models to the validated compatibility set", () => {
    expect(getProviderModelOptions(LLM_PROVIDER.Cerebras)).toEqual([
      { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
      {
        value: "meta-llama/llama-3.1-8b-instruct",
        label: "Llama 3.1 8B Instruct",
      },
    ]);
  });

  it("orders OpenAI direct models from newest flagship to smaller variants", () => {
    expect(getProviderModelOptions(LLM_PROVIDER.OpenAI)).toEqual([
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { value: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
      { value: "gpt-5", label: "GPT-5" },
      { value: "gpt-5-mini", label: "GPT-5 Mini" },
      { value: "gpt-5-nano", label: "GPT-5 Nano" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    ]);
  });

  it("includes Local as a direct provider with a free-form default model", () => {
    expect(getProviderModelOptions(LLM_PROVIDER.Local)).toEqual([
      { value: "llama3.2", label: "llama3.2" },
    ]);
    expect(normalizeProviderModel(LLM_PROVIDER.Local, "custom:model")).toBe(
      "custom:model",
    );
    expect(normalizeProviderModel(LLM_PROVIDER.Local, "   ")).toBe(
      getDefaultModelForProvider(LLM_PROVIDER.Local),
    );
  });

  it("normalizes invalid provider-model combinations to the provider default", () => {
    expect(
      normalizeProviderModel(LLM_PROVIDER.OpenAI, "openai/gpt-oss-120b"),
    ).toBe(getDefaultModelForProvider(LLM_PROVIDER.OpenAI));
  });

  it("maps known model ids to provider-aware friendly labels", () => {
    expect(getModelLabel(LLM_PROVIDER.OpenAI, "gpt-5.4-mini")).toBe(
      "GPT-5.4 Mini",
    );
  });

  it("keeps duplicate ids provider-scoped when resolving labels", () => {
    expect(
      getModelLabel(
        LLM_PROVIDER.OpenRouter,
        "meta-llama/llama-3.1-8b-instruct",
      ),
    ).toBe("Llama 3.1 8B");
    expect(
      getModelLabel(LLM_PROVIDER.Cerebras, "meta-llama/llama-3.1-8b-instruct"),
    ).toBe("Llama 3.1 8B Instruct");
  });

  it("falls back to the raw model id when a provider label is unknown", () => {
    expect(getModelLabel(LLM_PROVIDER.OpenAI, "unknown-model")).toBe(
      "unknown-model",
    );
  });

  it("falls back to the default direct provider for invalid persisted values", () => {
    expect(normalizeLLMProvider("not-a-provider")).toBe(
      DEFAULT_DIRECT_PROVIDER,
    );
  });
});
