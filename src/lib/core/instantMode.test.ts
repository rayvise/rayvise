import { describe, it, expect, vi, beforeEach } from "vitest";
import { runInstantMode } from "./instantMode";

const hoisted = vi.hoisted(() => {
  const invoke = vi.fn().mockResolvedValue(undefined);
  const emit = vi.fn().mockResolvedValue(undefined);
  const saveCompletion = vi.fn().mockResolvedValue(undefined);
  const showProgressOverlay = vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  }));
  const stream = vi.fn(
    async (
      _req: unknown,
      _apiKey: string,
      onChunk: (c: string) => void,
      signal: AbortSignal,
    ) => {
      void signal;
      onChunk("done");
    },
  );
  return { invoke, emit, saveCompletion, showProgressOverlay, stream };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => hoisted.invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => hoisted.emit(...args),
}));

vi.mock("#/services/overlayWindows", () => ({
  showProgressOverlay: hoisted.showProgressOverlay,
  showToastOverlay: vi.fn(),
  INSTANT_PROGRESS_STORAGE_KEY: "rayvise-pending-instant",
}));

vi.mock("#/services/db", () => ({
  saveCompletion: (...args: unknown[]) => hoisted.saveCompletion(...args),
}));

vi.mock("#/services/llm", () => ({
  getLLMClient: () => ({ stream: hoisted.stream }),
}));

describe("runInstantMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("writes text back, saves with wasApplied 1, emits completion-saved and instant-done", async () => {
    const controller = new AbortController();
    await runInstantMode({
      signal: controller.signal,
      selected_text: "in",
      target_pid: 99,
      app: "com.app",
      prompt: { id: "p1", name: "N", text: "sys" },
      promptSource: "app",
      pageUrl: null,
      matchedWebsitePattern: null,
      model: "m",
      provider: "openrouter",
      completionId: "cid-2",
      t0: 1_700_000_000_000,
      apiKey: "k",
    });

    expect(hoisted.showProgressOverlay).toHaveBeenCalled();
    expect(hoisted.stream).toHaveBeenCalled();
    expect(hoisted.invoke).toHaveBeenCalledWith("write_text_back", {
      text: "done",
      targetPid: 99,
    });
    expect(hoisted.saveCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cid-2",
        wasApplied: 1,
        isReviewMode: 0,
        hadError: 0,
      }),
    );
    expect(hoisted.emit.mock.calls.map((c) => c[0])).toEqual([
      "rayvise://completion-saved",
      "rayvise://instant-done",
    ]);
  });
});
