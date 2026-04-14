import {
  LLM_PROVIDER,
  type LLMClient,
  type LLMCompletion,
  type LLMRequest,
} from "./types";
import { chatCompletionBody } from "./chatCompletionBody";
import { getCompletionText, parseSSEStream } from "./streaming";

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const EXTRA_HEADERS = {
  "HTTP-Referer": "https://rayvise.com",
  "X-Title": "Rayvise",
};

export const openrouterClient: LLMClient = {
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
        ...EXTRA_HEADERS,
      },
      body: JSON.stringify(
        chatCompletionBody(LLM_PROVIDER.OpenRouter, req, false),
      ),
      signal,
    });
    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);

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
        ...EXTRA_HEADERS,
      },
      body: JSON.stringify(
        chatCompletionBody(LLM_PROVIDER.OpenRouter, req, true),
      ),
      signal,
    });
    if (!res.ok) {
      throw new Error(`OpenRouter error: ${res.status}`);
    }

    await parseSSEStream(res.body!, onChunk);
  },
};
