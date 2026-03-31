import type { LLMClient, LLMCompletion, LLMRequest } from "./types";
import { chatCompletionBody } from "./chatCompletionBody";
import { getCompletionText, parseSSEStream } from "./streaming";

const BASE_URL = "https://api.cerebras.ai/v1/chat/completions";

/**
 * Settings UI uses OpenRouter-style model ids. Cerebras Inference API expects
 * its own ids (see https://inference-docs.cerebras.ai/models/overview).
 */
function toCerebrasModelId(model: string): string {
  switch (model) {
    case "meta-llama/llama-3.1-8b-instruct":
      return "llama3.1-8b";
    case "openai/gpt-oss-120b":
      return "gpt-oss-120b";
    default:
      return model;
  }
}

function cerebrasRequestBody(req: LLMRequest, stream: boolean) {
  const base = chatCompletionBody(req, stream);
  return { ...base, model: toCerebrasModelId(base.model) };
}

export const cerebrasClient: LLMClient = {
  async complete(
    req: LLMRequest,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<LLMCompletion> {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(cerebrasRequestBody(req, false)),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Cerebras error: ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: getCompletionText(data),
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? null,
        output_tokens: data.usage?.completion_tokens ?? null,
      },
    };
  },

  async stream(
    req: LLMRequest,
    apiKey: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(cerebrasRequestBody(req, true)),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Cerebras error: ${res.status}`);
    }

    await parseSSEStream(res.body!, onChunk);
  },
};
