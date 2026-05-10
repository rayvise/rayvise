import { useEffect, useState, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Button } from "#/components/ui/button";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { cn } from "#/lib/utils";
import {
  REVIEW_STORAGE_KEY,
  type PendingReviewStorage,
} from "#/services/overlayWindows";

function loadStorage(): PendingReviewStorage | null {
  const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PendingReviewStorage;
  } catch {
    return null;
  }
}

type Phase =
  | { kind: "loading" }
  | {
      kind: "ready";
      completionId: string;
      targetPid: number;
      durationMs: number;
      originalText: string;
    }
  | { kind: "error"; message: string };

/** WKWebView / macOS sometimes differs on `key` vs `code` and modifier flags. */
function isApplyShortcut(e: KeyboardEvent): boolean {
  if (e.repeat) {
    return false;
  }
  const enter =
    e.key === "Enter" ||
    e.key === "NumpadEnter" ||
    e.code === "Enter" ||
    e.code === "NumpadEnter";
  if (!enter) {
    return false;
  }
  const meta =
    e.metaKey ||
    (typeof e.getModifierState === "function" && e.getModifierState("Meta"));
  const ctrl =
    e.ctrlKey ||
    (typeof e.getModifierState === "function" && e.getModifierState("Control"));
  return Boolean(meta || ctrl);
}

export function ReviewPage() {
  const initial = loadStorage();
  // Keep one handle for close/apply paths; recomputing it on render can make
  // effects fire again and disturb whichever app currently owns focus.
  const [win] = useState(() => getCurrentWebviewWindow());
  const isMac = navigator.userAgent.toLowerCase().includes("mac");
  const applyShortcutKbdClass =
    "border-neutral-200/90 bg-white font-mono text-[11px] text-neutral-900 shadow-sm dark:border-white/25 dark:bg-white dark:text-neutral-950";

  const [text, setText] = useState(
    initial?.loading === true
      ? initial.streamedText
      : initial?.loading === false
        ? initial.completedText
        : "",
  );
  const [originalText] = useState(initial ? initial.originalText : "");
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initial) {
      return { kind: "error", message: "No pending review found." };
    }

    if (initial.loading === false) {
      return {
        kind: "ready",
        completionId: initial.completionId,
        targetPid: initial.targetPid,
        durationMs: initial.durationMs,
        originalText: initial.originalText,
      };
    }

    return { kind: "loading" };
  });
  const [applied, setApplied] = useState(false);

  const phaseRef = useRef(phase);
  const textRef = useRef(text);
  const appliedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    appliedRef.current = applied;
  }, [applied]);

  useEffect(() => {
    if (!initial) {
      win.close();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to streaming events
  useEffect(() => {
    const unlistenChunk = listen<{ text: string }>(
      "rayvise://stream-chunk",
      (e) => {
        setText(e.payload.text);
      },
    );

    const unlistenDone = listen("rayvise://stream-done", () => {
      const stored = loadStorage();
      if (!stored || stored.loading !== false) {
        return;
      }
      setPhase({
        kind: "ready",
        completionId: stored.completionId,
        targetPid: stored.targetPid,
        durationMs: stored.durationMs,
        originalText: stored.originalText,
      });
    });

    const unlistenError = listen<{ message: string }>(
      "rayvise://stream-error",
      (e) => {
        setPhase({ kind: "error", message: e.payload.message });
        setTimeout(() => win.close(), 2500);
      },
    );

    const unlistenAbort = listen("rayvise://abort-overlay", () => {
      localStorage.removeItem(REVIEW_STORAGE_KEY);
      win.close();
    });

    return () => {
      unlistenChunk.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenAbort.then((fn) => fn());
    };
  }, [win]);

  const handleApply = useCallback(async () => {
    const ph = phaseRef.current;
    if (ph.kind !== "ready" || appliedRef.current) {
      return;
    }
    appliedRef.current = true;
    setApplied(true);
    const finalText = textRef.current;
    try {
      await invoke("write_text_back", {
        text: finalText,
        targetPid: ph.targetPid,
      });
      localStorage.removeItem(REVIEW_STORAGE_KEY);
      await emit("rayvise://review-outcome", {
        completionId: ph.completionId,
        finalText,
        wasApplied: true,
        targetPid: ph.targetPid,
      });
      await win.close();
    } catch {
      appliedRef.current = false;
      setApplied(false);
    }
  }, [win]);

  const handleDismiss = useCallback(async () => {
    localStorage.removeItem(REVIEW_STORAGE_KEY);
    if (phase.kind === "ready") {
      await emit("rayvise://review-outcome", {
        completionId: phase.completionId,
        finalText: null,
        wasApplied: false,
        targetPid: phase.targetPid,
      });
    }
    await win.close();
  }, [phase, win]);

  const handleCancel = useCallback(async () => {
    localStorage.removeItem(REVIEW_STORAGE_KEY);
    await emit("rayvise://stream-cancel", {
      targetPid: initial?.targetPid ?? 0,
    });
    await win.close();
  }, [initial?.targetPid, win]);

  const handleDismissRef = useRef(handleDismiss);
  const handleCancelRef = useRef(handleCancel);
  useEffect(() => {
    handleDismissRef.current = handleDismiss;
  }, [handleDismiss]);
  useEffect(() => {
    handleCancelRef.current = handleCancel;
  }, [handleCancel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (phaseRef.current.kind === "loading") {
          void handleCancelRef.current();
        } else {
          void handleDismissRef.current();
        }
        return;
      }
      if (isApplyShortcut(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void handleApply();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [handleApply]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isLoading = phase.kind === "loading";
  const isError = phase.kind === "error";
  const durationSec =
    phase.kind === "ready" ? (phase.durationMs / 1000).toFixed(1) : null;

  return (
    <div
      className="bg-background/95 text-foreground flex h-screen w-screen flex-col overflow-hidden rounded-lg backdrop-blur-xl"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {/* Title bar */}
      <div
        className="border-border flex shrink-0 items-center justify-between border-b px-6 py-4"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          {isLoading && (
            <svg
              className="text-muted-foreground size-3.5 shrink-0 animate-spin"
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
          )}
          <span className="text-foreground text-xs font-semibold tracking-[0.02em]">
            {isLoading ? "Generating…" : isError ? "Error" : "Review Response"}
          </span>
        </div>
        <div
          className="text-muted-foreground flex items-center gap-2 text-[11px]"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {!isLoading && wordCount > 0 && (
            <>
              <span>{wordCount} words</span>
              {durationSec && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span>{durationSec}s</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Original text */}
      {originalText && (
        <div className="border-border/80 shrink-0 border-b px-6 py-4">
          <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase">
            Original
          </p>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
            {originalText}
          </p>
        </div>
      )}

      {/* Completion editor / error */}
      <div className="bg-background/95 flex flex-1 flex-col overflow-hidden px-6 py-5">
        {isError ? (
          <p className="text-sm leading-relaxed text-red-400">
            {phase.message}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground mb-2 shrink-0 text-[10px] font-semibold tracking-[0.18em] uppercase">
              Completion
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={isLoading}
              autoFocus={!isLoading}
              onKeyDown={(e) => {
                if (isLoading || phase.kind !== "ready") {
                  return;
                }
                if (isApplyShortcut(e.nativeEvent)) {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleApply();
                }
              }}
              className={cn(
                "text-foreground flex-1 resize-none bg-transparent text-[15px] leading-[1.75]",
                "placeholder:text-muted-foreground focus:outline-none",
                isLoading && "text-muted-foreground cursor-default",
              )}
              placeholder={isLoading ? "" : undefined}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-border bg-muted/35 dark:bg-muted/25 flex shrink-0 items-center justify-between border-t px-6 py-4 backdrop-blur-xl">
        {isLoading ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            className="border-border bg-muted/60 text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-none"
          >
            <span>Cancel</span>
            <Kbd className="border-border bg-background font-mono text-[11px]">
              esc
            </Kbd>
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDismiss}
              className="border-border bg-muted/60 text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-none"
            >
              <span>Dismiss</span>
              <Kbd className="border-border bg-background font-mono text-[11px]">
                esc
              </Kbd>
            </Button>
            {!isError && (
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
                  {isMac ? (
                    <>
                      <KbdGroup>
                        <Kbd>⌃</Kbd>
                        <Plus
                          className="text-muted-foreground/70 size-3 shrink-0"
                          aria-hidden
                        />
                        <Kbd>↩</Kbd>
                      </KbdGroup>
                      <span>also works</span>
                    </>
                  ) : (
                    <>
                      <KbdGroup>
                        <Kbd>Cmd</Kbd>
                        <Plus
                          className="text-muted-foreground/70 size-3 shrink-0"
                          aria-hidden
                        />
                        <Kbd>Enter</Kbd>
                      </KbdGroup>
                      <span>also works</span>
                    </>
                  )}
                </span>
                <Button
                  type="button"
                  variant="default"
                  onClick={handleApply}
                  disabled={applied}
                  className="focus-visible:ring-ring/50 gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-none disabled:opacity-50"
                >
                  <span>Apply</span>
                  <KbdGroup>
                    {isMac ? (
                      <>
                        <Kbd className={applyShortcutKbdClass}>⌘</Kbd>
                        <Plus
                          className="text-primary-foreground size-3 shrink-0"
                          aria-hidden
                        />
                        <Kbd className={applyShortcutKbdClass}>↩</Kbd>
                      </>
                    ) : (
                      <>
                        <Kbd className={applyShortcutKbdClass}>Ctrl</Kbd>
                        <Plus
                          className="text-primary-foreground size-3 shrink-0"
                          aria-hidden
                        />
                        <Kbd className={applyShortcutKbdClass}>Enter</Kbd>
                      </>
                    )}
                  </KbdGroup>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
