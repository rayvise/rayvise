function extractContentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractContentText(item)).join("");
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      extractContentText(record.text),
      extractContentText(record.content),
      extractContentText(record.output_text),
      extractContentText(record.value),
    ].join("");
  }

  return "";
}

export function getCompletionText(data: {
  choices?: Array<{ message?: { content?: unknown } }>;
}): string {
  return extractContentText(data.choices?.[0]?.message?.content);
}

export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line === "" || line.startsWith(":") || !line.startsWith("data:")) {
        continue;
      }

      const raw = line.slice(5).trim();
      if (raw === "[DONE]") {
        return;
      }

      let chunk: {
        error?: { message?: string };
        choices?: Array<{
          finish_reason?: string;
          delta?: { content?: unknown };
          message?: { content?: unknown };
        }>;
      };

      try {
        chunk = JSON.parse(raw) as typeof chunk;
      } catch {
        continue;
      }

      if (chunk.error?.message) {
        throw new Error(chunk.error.message);
      }

      for (const choice of chunk.choices ?? []) {
        if (choice.finish_reason === "error") {
          throw new Error("stream terminated with an error");
        }

        const content =
          extractContentText(choice.delta?.content) ||
          extractContentText(choice.message?.content);

        if (content) {
          onChunk(content);
        }
      }
    }
  }
}
