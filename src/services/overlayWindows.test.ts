import { beforeEach, describe, expect, it, vi } from "vitest";
import { showReviewOverlay } from "./overlayWindows";

const hoisted = vi.hoisted(() => {
  const mainHide = vi.fn().mockResolvedValue(undefined);
  const lookupHide = vi.fn().mockResolvedValue(undefined);
  const setFocus = vi.fn().mockResolvedValue(undefined);
  const once = vi.fn(
    (event: string, cb: () => void | Promise<void>) => {
      if (event === "tauri://created") {
        void cb();
      }
    },
  );
  const currentWindow = {
    label: "main",
    hide: mainHide,
  };
  const getCurrentWindow = vi.fn(() => currentWindow);
  const getByLabel = vi
    .fn()
    .mockResolvedValue({ label: "main", hide: lookupHide });
  const WebviewWindow = vi.fn().mockImplementation(function MockWebviewWindow() {
    return {
      once,
      setFocus,
    };
  });

  return {
    WebviewWindow,
    getByLabel,
    getCurrentWindow,
    currentWindow,
    mainHide,
    lookupHide,
    setFocus,
    once,
  };
});

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: hoisted.WebviewWindow,
}));

vi.mock("@tauri-apps/api/window", () => ({
  Window: {
    getByLabel: (...args: unknown[]) => hoisted.getByLabel(...args),
  },
  getCurrentWindow: () => hoisted.getCurrentWindow(),
}));

vi.mock("#/hooks/useToast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("showReviewOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.currentWindow.label = "main";
    hoisted.getByLabel.mockResolvedValue({ label: "main", hide: hoisted.lookupHide });
  });

  it("creates a focused review overlay and keeps main hidden", async () => {
    showReviewOverlay();
    await Promise.resolve();

    expect(hoisted.WebviewWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^review-/),
      expect.objectContaining({
        url: "/?overlay=review",
        alwaysOnTop: true,
        focus: true,
      }),
    );
    expect(hoisted.mainHide).toHaveBeenCalled();
    expect(hoisted.setFocus).toHaveBeenCalled();
  });

  it("falls back to label lookup when called outside main window context", async () => {
    hoisted.currentWindow.label = "review-123";

    showReviewOverlay();
    await Promise.resolve();

    expect(hoisted.getByLabel).toHaveBeenCalledWith("main");
    expect(hoisted.lookupHide).toHaveBeenCalled();
  });
});

