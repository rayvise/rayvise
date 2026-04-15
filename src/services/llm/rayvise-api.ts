import type { LLMClient, LLMCompletion } from "./types";

export const rayviseApiClient: LLMClient = {
  async complete(): Promise<LLMCompletion> {
    throw new Error("Rayvise API — coming soon");
  },
  async stream(): Promise<void> {
    throw new Error("Rayvise API — coming soon");
  },
};
