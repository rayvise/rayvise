import { describe, expect, it } from "vitest";
import { dryRunClient } from "./dryRun";

describe("dryRunClient", () => {
  it("includes provider and model info in the dry-run header", async () => {
    const chunks: string[] = [];

    await dryRunClient.stream(
      {
        messages: [
          { role: "instruction", content: "sys" },
          { role: "user", content: "selected text" },
        ],
        model: "gpt-4o-mini",
        dryRunMetadata: {
          promptName: "Prompt A",
          pageUrl: "https://example.com/page",
          provider: "openai",
        },
      },
      "dry-run",
      (chunk) => {
        chunks.push(chunk);
      },
    );

    expect(chunks).toEqual([
      "[DRY RUN] | Provider: OpenAI | Model: gpt-4o-mini | Prompt: Prompt A | Page: https://example.com/page\n\nselected text",
    ]);
  });

  it("falls back to the raw user text when metadata is missing", async () => {
    const chunks: string[] = [];

    const result = await dryRunClient.complete(
      {
        messages: [{ role: "user", content: "plain text" }],
        model: "m",
      },
      "dry-run",
    );

    chunks.push(result.text);

    expect(chunks).toEqual(["[DRY RUN] | Model: m\n\nplain text"]);
  });
});
