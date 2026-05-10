import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "#/stores";
import { LLM_PROVIDER } from "./types";
import { localClient } from "./local";

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (event: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(event, handler);
      return Promise.resolve(() => listeners.delete(event));
    },
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

describe("localClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    useSettingsStore.setState({
      provider: LLM_PROVIDER.Local,
      localBaseUrl: "http://localhost:11434/v1",
      localApiKey: "",
      model: "llama3.2",
    });
  });

  it("streams through Rust and strips think blocks across chunks", async () => {
    invoke.mockImplementation(
      (command: string, args: { sessionId: string }) => {
        if (command === "stream_local_chat_completion") {
          const handler = listeners.get("rayvise://local-llm-stream");
          handler?.({
            payload: { sessionId: args.sessionId, text: "Hello <thi" },
          });
          handler?.({
            payload: {
              sessionId: args.sessionId,
              text: "nk>hidden</think> world",
            },
          });
        }
        return Promise.resolve();
      },
    );

    let seen = "";
    await localClient.stream(
      {
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      },
      "",
      (chunk) => {
        seen += chunk;
      },
    );

    expect(seen).toBe("Hello  world");
    expect(invoke).toHaveBeenCalledWith(
      "stream_local_chat_completion",
      expect.objectContaining({
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
      }),
    );
  });

  it("cancels the Rust stream command on abort", async () => {
    let rejectStream: (err: Error) => void = () => {};
    invoke.mockImplementation((command: string) => {
      if (command === "stream_local_chat_completion") {
        return new Promise((_resolve, reject) => {
          rejectStream = reject;
        });
      }
      return Promise.resolve();
    });

    const controller = new AbortController();
    const promise = localClient.stream(
      {
        model: "llama3.2",
        messages: [{ role: "user", content: "Hi" }],
      },
      "",
      () => {},
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();
    rejectStream(new Error("canceled"));

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).toHaveBeenCalledWith(
      "cancel_local_chat_completion",
      expect.objectContaining({ sessionId: expect.any(String) }),
    );
  });
});
