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
  const body = {
    ...rest,
    messages: messages.map((message) => ({
      ...message,
      role: toProviderRole(provider, message.role),
    })),
    stream,
  };

  if (provider === LLM_PROVIDER.Local) {
    return {
      ...body,
      reasoning_effort: "none",
      reasoning: { effort: "none" },
    };
  }

  return body;
}
