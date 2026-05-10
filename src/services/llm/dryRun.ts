import { getProviderLabel } from "./models";
import type { LLMClient, LLMRequest } from "./types";

export const dryRunClient: LLMClient = {
  async complete(req: LLMRequest, _apiKey: string, signal?: AbortSignal) {
    await waitForLatency(signal);

    return {
      text: getDryRunText(req),
      usage: { input_tokens: null, output_tokens: null },
    };
  },

  async stream(
    req: LLMRequest,
    _apiKey: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ) {
    await waitForLatency(signal);
    onChunk(getDryRunText(req));
  },
};

function getDryRunText(req: LLMRequest) {
  const userMessage =
    [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const metadata = req.dryRunMetadata;
  const parts: string[] = ["[DRY RUN]"];
  if (metadata?.provider) {
    parts.push(`Provider: ${getProviderLabel(metadata.provider)}`);
  }
  const model = req.model.trim();
  if (model) {
    parts.push(`Model: ${model}`);
  }
  const name = metadata?.promptName?.trim();
  if (name) {
    parts.push(`Prompt: ${name}`);
  }
  const url = metadata?.pageUrl?.trim();
  if (url) {
    parts.push(`Page: ${url}`);
  }
  const dryRunHeader = parts.join(" | ");

  return `${dryRunHeader}\n\n${userMessage}`;
}

function waitForLatency(signal?: AbortSignal, ms = 500) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
