import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ReviewPage } from "./ReviewPage";
import { REVIEW_STORAGE_KEY } from "#/services/overlayWindows";

const mockInvoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEmit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));
const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSetFocus = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: mockEmit,
  listen: mockListen,
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    close: mockClose,
    setFocus: mockSetFocus,
  }),
}));

describe("ReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(
      REVIEW_STORAGE_KEY,
      JSON.stringify({
        loading: false,
        completionId: "completion-1",
        targetPid: 42,
        completedText: "Updated text",
        streamedText: "Updated text",
        durationMs: 250,
        originalText: "Original text",
      }),
    );
  });

  it("focuses the review window and applies only once for a Cmd/Ctrl+Enter key press", async () => {
    render(<ReviewPage />);
    expect(mockSetFocus).toHaveBeenCalled();

    fireEvent.keyDown(document, {
      key: "Enter",
      code: "Enter",
      metaKey: true,
    });
    fireEvent.keyUp(document, {
      key: "Enter",
      code: "Enter",
      metaKey: true,
    });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("write_text_back", {
        text: "Updated text",
        targetPid: 42,
      }),
    );
    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "write_text_back"),
    ).toHaveLength(1);
  });
});
