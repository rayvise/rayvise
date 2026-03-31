import type { LLMClient, LLMCompletion, LLMRequest } from "./types";
import { chatCompletionBody } from "./chatCompletionBody";
import { getCompletionText, parseSSEStream } from "./streaming";

const BASE_URL = "https://api.openai.com/v1/chat/completions";

export const openaiClient: LLMClient = {
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
      body: JSON.stringify(chatCompletionBody(req, false)),
      signal,
    });

    if (!res.ok) {
      throw new Error(`OpenAI error: ${res.status}`);
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
      body: JSON.stringify(chatCompletionBody(req, true)),
      signal,
    });

    if (!res.ok) {
      throw new Error(`OpenAI error: ${res.status}`);
    }

    await parseSSEStream(res.body!, onChunk);
  },
};
