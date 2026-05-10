export const LLM_PROVIDER = {
  OpenRouter: "openrouter",
  Cerebras: "cerebras",
  OpenAI: "openai",
  Local: "local",
} as const;

export type LLMProvider = (typeof LLM_PROVIDER)[keyof typeof LLM_PROVIDER];

export interface LLMMessage {
  role: "instruction" | "user" | "assistant";
  content: string;
}

/** Passed only for dry-run output labeling; stripped before real API calls. */
export interface LLMDryRunMetadata {
  promptName: string;
  pageUrl?: string | null;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;
  stream?: boolean;
  dryRunMetadata?: LLMDryRunMetadata;
}

export interface LLMUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface LLMCompletion {
  text: string;
  usage: LLMUsage;
}

export interface LLMClient {
  complete(
    req: LLMRequest,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<LLMCompletion>;
  stream(
    req: LLMRequest,
    apiKey: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}
