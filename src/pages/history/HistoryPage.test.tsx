import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { HistoryPage } from "./HistoryPage";
import { useAppsStore } from "#/stores";
import type { CompletionEntry, CompletionListEntry } from "#/services/db";

vi.mock("#/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div data-testid="resizable-panel-group" className={className}>
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div data-testid="resizable-panel" className={className}>
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

vi.mock("#/hooks/useAppIcons", () => ({
  useAppIcons: () => ({}),
}));

const dbMocks = vi.hoisted(() => ({
  listCompletions: vi.fn(),
  getCompletion: vi.fn(),
  getUsageStats: vi.fn(),
  listDistinctPrompts: vi.fn(),
  deleteCompletion: vi.fn().mockResolvedValue(undefined),
  clearAllCompletions: vi.fn().mockResolvedValue(undefined),
  resetAllHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/services/db", () => ({
  listCompletions: (...args: unknown[]) => dbMocks.listCompletions(...args),
  getCompletion: (...args: unknown[]) => dbMocks.getCompletion(...args),
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

const sampleListRow: CompletionListEntry = {
  id: "c1",
  timestamp: Date.now(),
  inputText: "hello",
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
  promptSource: "default",
  pageUrl: null,
  matchedWebsitePattern: null,
  model: "m",
  provider: "openrouter",
};

const sampleFullRow: CompletionEntry = {
  ...sampleListRow,
  outputText: "world",
  finalText: null,
  promptText: "full prompt body",
};

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    useAppsStore.setState({
      apps: [],
      activeApp: null,
      hiddenAppBundleIds: [],
    });
    dbMocks.listCompletions.mockResolvedValue([sampleListRow]);
    dbMocks.getCompletion.mockResolvedValue(sampleFullRow);
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

  it("loads full completion when opening the detail dialog", async () => {
    let resolveDetail!: (row: CompletionEntry | null) => void;
    const detailPromise = new Promise<CompletionEntry | null>((resolve) => {
      resolveDetail = resolve;
    });
    dbMocks.getCompletion.mockReturnValue(detailPromise);

    const user = userEvent.setup();
    render(<HistoryPage />);

    await waitFor(() =>
      expect(dbMocks.listCompletions).toHaveBeenCalledTimes(1),
    );

    const card = screen.getByText("hello").closest('[role="button"]');
    expect(card).toBeTruthy();
    await user.click(card!);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() =>
      expect(dbMocks.getCompletion).toHaveBeenCalledWith("c1"),
    );
    resolveDetail(sampleFullRow);

    await waitFor(() => {
      expect(screen.getByText("world")).toBeInTheDocument();
    });
  });

  it("shows a message when getCompletion returns null", async () => {
    dbMocks.getCompletion.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<HistoryPage />);

    await waitFor(() =>
      expect(dbMocks.listCompletions).toHaveBeenCalledTimes(1),
    );

    const card = screen.getByText("hello").closest('[role="button"]');
    await user.click(card!);

    await waitFor(() => {
      expect(
        screen.getByText("This entry could not be loaded."),
      ).toBeInTheDocument();
    });
  });
});
