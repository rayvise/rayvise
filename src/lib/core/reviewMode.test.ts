import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReviewMode } from "./reviewMode";

const hoisted = vi.hoisted(() => {
  const emit = vi.fn().mockResolvedValue(undefined);
  const saveCompletion = vi.fn().mockResolvedValue(undefined);
  const showReviewOverlay = vi.fn();
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
  return { emit, saveCompletion, showReviewOverlay, stream };
});

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => hoisted.emit(...args),
}));

vi.mock("#/services/overlayWindows", () => ({
  showReviewOverlay: hoisted.showReviewOverlay,
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
  });
});
