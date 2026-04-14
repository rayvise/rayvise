import { LLM_PROVIDER, type LLMProvider, type LLMRequest } from "./types";

function toProviderRole(
  provider: LLMProvider,
  role: LLMRequest["messages"][number]["role"],
): "developer" | "system" | "user" | "assistant" {
  switch (role) {
    case "instruction":
      return provider === LLM_PROVIDER.OpenAI ? "developer" : "system";
    case "user":
    case "assistant":
      return role;
  }
}

/** JSON body for chat/completions (strips Rayvise-only fields). */
export function chatCompletionBody(
  provider: LLMProvider,
  req: LLMRequest,
  stream: boolean,
) {
  const { dryRunMetadata, messages, ...rest } = req;
  void dryRunMetadata;
  return {
    ...rest,
    messages: messages.map((message) => ({
      ...message,
      role: toProviderRole(provider, message.role),
    })),
    stream,
  };
}
