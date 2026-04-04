import { describe, expect, it } from "vitest";
import { getCompletionText, parseSSEStream } from "./streaming";

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

describe("streaming compatibility parsing", () => {
  it("extracts text from array/object chat completion payloads", () => {
    expect(
      getCompletionText({
        choices: [
          {
            message: {
              content: [
                { type: "output_text", text: "Hello" },
                { type: "output_text", text: " world" },
              ],
            },
          },
        ],
      }),
    ).toBe("Hello world");
  });

  it("streams GPT-5 style content parts", async () => {
    let seen = "";

    await parseSSEStream(
      streamFromLines([
        'data: {"choices":[{"delta":{"content":[{"type":"output_text","text":"Hello"},{"type":"output_text","text":" world"}]}}]}',
        "data: [DONE]",
      ]),
      (chunk) => {
        seen += chunk;
      },
    );

    expect(seen).toBe("Hello world");
  });
});
