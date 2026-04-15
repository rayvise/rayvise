import { useEffect } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  INSTANT_PROGRESS_STORAGE_KEY,
  type PendingInstantProgressStorage,
} from "#/services/overlayWindows";

export function ProgressPage() {
  const win = getCurrentWebviewWindow();
  const progressState = loadProgressState();

  useEffect(() => {
    // Instant completions can finish before this overlay hydrates, so use the
    // persisted state as the source of truth for whether the window should stay open.
    if (!progressState || progressState.loading === false) {
      localStorage.removeItem(INSTANT_PROGRESS_STORAGE_KEY);
      win.close();
    }
  }, [progressState, win]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        localStorage.removeItem(INSTANT_PROGRESS_STORAGE_KEY);
        // Echo the original target PID back to the main listener so canceling
        // instant mode restores focus to the app the user came from.
        emit("rayvise://instant-cancel", {
          targetPid: progressState?.targetPid ?? 0,
        }).catch(() => {});
        win.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [progressState, win]);

  useEffect(() => {
    const handleClose = () => {
      localStorage.removeItem(INSTANT_PROGRESS_STORAGE_KEY);
      win.close();
    };

    const unlistenDone = listen("rayvise://instant-done", handleClose);
    const unlistenAbort = listen("rayvise://abort-overlay", handleClose);

    return () => {
      unlistenDone.then((fn) => fn());
      unlistenAbort.then((fn) => fn());
    };
  }, [win]);

  return (
    <div className="flex h-screen items-center gap-3 rounded-2xl border border-white/10 bg-neutral-950/92 px-4 text-neutral-200 shadow-2xl backdrop-blur-md">
      <svg
        className="size-4 shrink-0 animate-spin text-neutral-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="flex-1 text-sm font-medium">Processing…</span>
      <span className="text-xs text-neutral-500">Esc to cancel</span>
    </div>
  );
}

function loadProgressState(): PendingInstantProgressStorage | null {
  const raw = localStorage.getItem(INSTANT_PROGRESS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PendingInstantProgressStorage;
  } catch {
    return null;
  }
}
