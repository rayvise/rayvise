import type { LLMRequest } from "./types";

function normalizeModelId(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

function getReasoningEffort(model: string): string | null {
  const normalized = normalizeModelId(model).toLowerCase();
  if (normalized === "gpt-5.4" || normalized.startsWith("gpt-5.4-")) {
    return "none";
  }

  if (normalized === "gpt-5" || normalized.startsWith("gpt-5-")) {
    return "minimal";
  }

  return null;
}

/** JSON body for OpenAI-compatible chat/completions (strips Raypaste-only fields). */
export function chatCompletionBody(req: LLMRequest, stream: boolean) {
  const { dryRunMetadata, ...rest } = req;
  void dryRunMetadata;
  const reasoningEffort = getReasoningEffort(rest.model);
  return reasoningEffort
    ? { ...rest, stream, reasoning_effort: reasoningEffort }
    : { ...rest, stream };
}
