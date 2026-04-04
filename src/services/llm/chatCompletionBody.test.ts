import { describe, expect, it } from "vitest";
import { chatCompletionBody } from "./chatCompletionBody";
import { LLM_PROVIDER, type LLMRequest } from "./types";

const request: LLMRequest = {
  model: "gpt-5.4-mini",
  dryRunMetadata: {
    promptName: "Test Prompt",
  },
  messages: [
    { role: "instruction", content: "Follow the prompt." },
    { role: "user", content: "Hello" },
  ],
};

describe("chatCompletionBody", () => {
  it("serializes instruction messages as developer for OpenAI", () => {
    expect(chatCompletionBody(LLM_PROVIDER.OpenAI, request, false)).toEqual({
      model: "gpt-5.4-mini",
      messages: [
        { role: "developer", content: "Follow the prompt." },
        { role: "user", content: "Hello" },
      ],
      stream: false,
    });
  });

  it("serializes instruction messages as system for OpenRouter-compatible providers", () => {
    expect(chatCompletionBody(LLM_PROVIDER.OpenRouter, request, true)).toEqual({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: "Follow the prompt." },
        { role: "user", content: "Hello" },
      ],
      stream: true,
    });
  });

  it("does not send dry-run metadata or reasoning_effort", () => {
    const body = chatCompletionBody(LLM_PROVIDER.OpenAI, request, false) as {
      dryRunMetadata?: unknown;
      reasoning_effort?: unknown;
    };

    expect(body.dryRunMetadata).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });
});
