import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { toast } from "#/hooks/useToast";
import { OVERLAY } from "#/lib/overlay";
import type { PromptSource } from "#/stores";

export type NotificationVariant = "error" | "success" | "info";

/**
 * Hotkey / LLM completion feedback: opens a small always-on-top window at the
 * bottom-right of the screen so the user sees it while focused in another app.
 * In-app UI should keep using Sonner via `toast` from `#/hooks/useToast` directly.
 */
export function showToastOverlay(
  message: string,
  variant: NotificationVariant,
  durationMs = 3000,
): void {
  const width = 400;
  const height = 152;
  const margin = 16;
  const x = Math.round(window.screen.availWidth - width - margin);
  const y = Math.round(window.screen.availHeight - height - margin);

  const params = new URLSearchParams({
    overlay: OVERLAY.toast,
    message,
    variant,
    duration: String(durationMs),
  });

  try {
    new WebviewWindow(`notification-${Date.now()}`, {
      url: `/?${params.toString()}`,
      width,
      height,
      x,
      y,
      transparent: true,
      decorations: false,
      shadow: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
    });
  } catch {
    const opts = { duration: durationMs };
    switch (variant) {
      case "error":
        toast.error(message, opts);
        break;
      case "success":
        toast.success(message, opts);
        break;
      case "info":
        toast.info(message, opts);
        break;
    }
  }
}

// Stored in localStorage while a review is pending or streaming
export type PendingReviewStorage =
  | {
      loading: true;
      originalText: string;
      targetPid: number;
      streamedText: string;
    }
  | {
      loading: false;
      completionId: string;
      completedText: string;
      originalText: string;
      targetPid: number;
      durationMs: number;
    };

export const REVIEW_STORAGE_KEY = "rayvise-pending-review";
export const INSTANT_PROGRESS_STORAGE_KEY = "rayvise-pending-instant";
export const PROMPT_PICK_STORAGE_KEY = "rayvise-pending-prompt-pick";

export interface PendingPromptPickCandidate {
  id: string;
  name: string;
  source: PromptSource;
  matchedWebsitePattern: string | null;
}

export interface PendingPromptPickStorage {
  sessionId: string;
  targetPid: number;
  app: string;
  selected_text: string;
  page_url: string | null;
  candidates: PendingPromptPickCandidate[];
}

/** Emitted to the main window; self-contained so the listener does not rely on localStorage (picker may clear storage on a different webview timing). */
export type PromptPickedEventPayload = {
  sessionId: string;
  promptId: string;
  targetPid: number;
  app: string;
  selected_text: string;
  page_url: string | null;
  candidates: PendingPromptPickCandidate[];
};

export interface PendingInstantProgressStorage {
  loading: boolean;
  targetPid: number;
}

/**
 * Open the review overlay window. The caller must write initial state to
 * localStorage under REVIEW_STORAGE_KEY before calling this.
 */
export function showReviewOverlay(): WebviewWindow | null {
  const width = 600;
  const height = 700;
  const x = Math.round((window.screen.availWidth - width) / 2);
  const y = Math.round((window.screen.availHeight - height) / 2);

  try {
    // Keep the source app, such as Chrome, active after the global hotkey.
    // The review overlay should be visible by itself, without the main app
    // window appearing or stealing focus.
    void Window.getByLabel("main")
      .then((main) => main?.hide())
      .catch(() => {});
    const win = new WebviewWindow(`review-${Date.now()}`, {
      url: `/?overlay=${OVERLAY.review}`,
      width,
      height,
      transparent: true,
      decorations: false,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
      x,
      y,
    });
    queueMicrotask(() => {
      // Hide again after creation because macOS/Tauri can briefly surface the
      // main window while adding a child overlay.
      void Window.getByLabel("main")
        .then((main) => main?.hide())
        .catch(() => {});
    });
    return win;
  } catch {
    return null;
  }
}

/** Open the small progress spinner overlay for instant-mode LLM requests. */
export function showProgressOverlay(): WebviewWindow | null {
  const width = 280;
  const height = 50;
  const x = Math.round((window.screen.availWidth - width) / 2);
  const y = Math.round((window.screen.availHeight - height) / 2);

  try {
    return new WebviewWindow(`progress-${Date.now()}`, {
      url: `/?overlay=${OVERLAY.progress}`,
      width,
      height,
      transparent: true,
      decorations: false,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      // Match review overlay: without focus, macOS can activate Rayvise but
      // leave keyboard focus on the main window instead of this overlay.
      focus: true,
      x,
      y,
    });
  } catch {
    return null;
  }
}

/** Overlay to choose among multiple prompts for the current hotkey context. */
export function showPromptPickOverlay(): WebviewWindow | null {
  const width = 440;
  const height = 420;
  const x = Math.round((window.screen.availWidth - width) / 2);
  const y = Math.round((window.screen.availHeight - height) / 2);

  try {
    return new WebviewWindow(`prompt-pick-${Date.now()}`, {
      url: `/?overlay=${OVERLAY.promptPick}`,
      width,
      height,
      transparent: true,
      decorations: false,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: true,
      x,
      y,
    });
  } catch {
    return null;
  }
}
