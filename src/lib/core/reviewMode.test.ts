import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReviewMode } from "./reviewMode";

const hoisted = vi.hoisted(() => {
  const emit = vi.fn().mockResolvedValue(undefined);
  const saveCompletion = vi.fn().mockResolvedValue(undefined);
  const showReviewOverlay = vi.fn();
  const showToastOverlay = vi.fn();
  const stream = vi.fn(
    async (
      _req: unknown,
      _apiKey: string,
      onChunk: (c: string) => void,
      signal: AbortSignal,
    ) => {
      void signal;
      onChunk("out");
    },
  );
  return { emit, saveCompletion, showReviewOverlay, showToastOverlay, stream };
});

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => hoisted.emit(...args),
}));

vi.mock("#/services/overlayWindows", () => ({
  showReviewOverlay: hoisted.showReviewOverlay,
  showToastOverlay: hoisted.showToastOverlay,
  REVIEW_STORAGE_KEY: "rayvise-pending-review",
}));

vi.mock("#/services/db", () => ({
  saveCompletion: (...args: unknown[]) => hoisted.saveCompletion(...args),
}));

vi.mock("#/services/llm", () => ({
  getLLMClient: () => ({ stream: hoisted.stream }),
}));

describe("runReviewMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("streams, saves completion with wasApplied 0, emits completion-saved then stream-done", async () => {
    const controller = new AbortController();
    await runReviewMode({
      signal: controller.signal,
      selected_text: "in",
      target_pid: 42,
      app: "com.app",
      prompt: { id: "p1", name: "N", text: "sys" },
      promptSource: "default",
      pageUrl: null,
      matchedWebsitePattern: null,
      model: "m",
      provider: "openrouter",
      completionId: "cid-1",
      t0: 1_700_000_000_000,
      apiKey: "k",
    });

    expect(hoisted.showReviewOverlay).toHaveBeenCalled();
    expect(hoisted.stream).toHaveBeenCalled();
    expect(hoisted.stream.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        dryRunMetadata: expect.objectContaining({
          provider: "openrouter",
        }),
      }),
    );
    expect(hoisted.saveCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cid-1",
        wasApplied: 0,
        isReviewMode: 1,
        hadError: 0,
        appId: "com.app",
        promptId: "p1",
      }),
    );
    expect(hoisted.emit.mock.calls.map((c) => c[0])).toEqual([
      "rayvise://stream-chunk",
      "rayvise://completion-saved",
      "rayvise://stream-done",
    ]);
    expect(hoisted.showToastOverlay).not.toHaveBeenCalled();
  });

  it("shows an error toast and saves errored completion when review streaming fails", async () => {
    hoisted.stream.mockRejectedValueOnce(
      new Error(
        "Local provider request failed: error sending request for url (http://localhost:11434/v1/chat/completions)",
      ),
    );

    const controller = new AbortController();
    await runReviewMode({
      signal: controller.signal,
      selected_text: "in",
      target_pid: 42,
      app: "com.app",
      prompt: { id: "p1", name: "N", text: "sys" },
      promptSource: "default",
      pageUrl: null,
      matchedWebsitePattern: null,
      model: "m",
      provider: "local",
      completionId: "cid-err",
      t0: 1_700_000_000_000,
      apiKey: "",
    });

    expect(hoisted.showToastOverlay).toHaveBeenCalledWith(
      "Could not connect to Ollama. Start Ollama and try again.",
      "error",
      4500,
    );
    expect(hoisted.emit).toHaveBeenCalledWith("rayvise://stream-error", {
      message:
        "Local provider request failed: error sending request for url (http://localhost:11434/v1/chat/completions)",
    });
    expect(hoisted.saveCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cid-err",
        hadError: 1,
        errorMessage:
          "Local provider request failed: error sending request for url (http://localhost:11434/v1/chat/completions)",
      }),
    );
  });
});
