import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HistoryPage } from "./HistoryPage";

const dbMocks = vi.hoisted(() => ({
  listCompletions: vi.fn(),
  getUsageStats: vi.fn(),
  listDistinctPrompts: vi.fn(),
  deleteCompletion: vi.fn().mockResolvedValue(undefined),
  clearAllCompletions: vi.fn().mockResolvedValue(undefined),
  resetAllHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/services/db", () => ({
  listCompletions: (...args: unknown[]) => dbMocks.listCompletions(...args),
  getUsageStats: (...args: unknown[]) => dbMocks.getUsageStats(...args),
  listDistinctPrompts: (...args: unknown[]) =>
    dbMocks.listDistinctPrompts(...args),
  deleteCompletion: (...args: unknown[]) => dbMocks.deleteCompletion(...args),
  clearAllCompletions: (...args: unknown[]) =>
    dbMocks.clearAllCompletions(...args),
  resetAllHistory: (...args: unknown[]) => dbMocks.resetAllHistory(...args),
}));

const listeners = vi.hoisted(
  () => new Map<string, (e: { payload?: unknown }) => void | Promise<void>>(),
);

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: unknown) => void) => {
    listeners.set(event, handler);
    return Promise.resolve(() => {});
  },
}));

const sampleRow = {
  id: "c1",
  timestamp: Date.now(),
  inputText: "hello",
  outputText: "world",
  finalText: null,
  wasApplied: 0,
  isReviewMode: 1,
  hadError: 0,
  errorMessage: null,
  inputTokens: null,
  outputTokens: null,
  completionMs: 50,
  appId: "com.app",
  promptId: "p1",
  promptName: "P",
  promptText: "t",
  promptSource: "default",
  pageUrl: null,
  matchedWebsitePattern: null,
  model: "m",
  provider: "openrouter",
};

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    dbMocks.listCompletions.mockResolvedValue([sampleRow]);
    dbMocks.getUsageStats.mockResolvedValue({
      id: "global",
      totalCompletions: 1,
      totalApplied: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCompletionMs: 50,
      promptStats: { p1: { uses: 1, applied: 0 } },
      appStats: { "com.app": { uses: 1, applied: 0 } },
    });
    dbMocks.listDistinctPrompts.mockResolvedValue([
      { promptId: "p1", promptName: "P" },
    ]);
  });

  it("refetches when rayvise://completion-saved fires", async () => {
    render(<HistoryPage />);

    await waitFor(() =>
      expect(dbMocks.listCompletions).toHaveBeenCalledTimes(1),
    );

    const handler = listeners.get("rayvise://completion-saved");
    expect(handler).toBeDefined();
    await handler!({});

    await waitFor(() =>
      expect(dbMocks.listCompletions).toHaveBeenCalledTimes(2),
    );
  });
});
