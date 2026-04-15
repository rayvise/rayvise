import type { CSSProperties, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { X } from "lucide-react";
import { cn } from "#/lib/utils";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import {
  PROMPT_PICK_STORAGE_KEY,
  type PendingPromptPickStorage,
  type PromptPickedEventPayload,
} from "#/services/overlayWindows";

function loadSession(): PendingPromptPickStorage | null {
  const raw = localStorage.getItem(PROMPT_PICK_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PendingPromptPickStorage;
  } catch {
    return null;
  }
}

export function PromptPickPage() {
  const win = getCurrentWebviewWindow();
  const [session] = useState(loadSession);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const confirm = useCallback(
    async (index: number) => {
      if (!session || index < 0 || index >= session.candidates.length) {
        return;
      }
      const c = session.candidates[index];
      const payload: PromptPickedEventPayload = {
        sessionId: session.sessionId,
        promptId: c.id,
        targetPid: session.targetPid,
        app: session.app,
        selected_text: session.selected_text,
        page_url: session.page_url,
        candidates: session.candidates,
      };
      await emit("rayvise://prompt-picked", payload);
      localStorage.removeItem(PROMPT_PICK_STORAGE_KEY);
      await win.close();
    },
    [session, win],
  );

  const cancel = useCallback(async () => {
    const pid = session?.targetPid ?? 0;
    localStorage.removeItem(PROMPT_PICK_STORAGE_KEY);
    await emit("rayvise://prompt-pick-cancel", { targetPid: pid });
    await win.close();
  }, [session, win]);

  useEffect(() => {
    if (!session || session.candidates.length === 0) {
      localStorage.removeItem(PROMPT_PICK_STORAGE_KEY);
      void win.close();
    }
  }, [session, win]);

  useEffect(() => {
    if (!session?.candidates.length) {
      return;
    }
    const t = window.setTimeout(() => {
      rootRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, [session]);

  const onKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!session?.candidates.length) {
        return;
      }
      const n = session.candidates.length;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        void cancel();
        return;
      }
      if (e.key === "Enter" || e.key === "NumpadEnter") {
        e.preventDefault();
        e.stopPropagation();
        void confirm(selectedIndexRef.current);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i - 1 + n) % n);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i + 1) % n);
      }
    },
    [session, cancel, confirm],
  );

  useEffect(() => {
    const unlisten = listen("rayvise://abort-overlay", () => {
      localStorage.removeItem(PROMPT_PICK_STORAGE_KEY);
      void win.close();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [win]);

  if (!session || session.candidates.length === 0) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDownCapture={onKeyDownCapture}
      className="border-border bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden rounded-lg border shadow-lg backdrop-blur-xl outline-none"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <div
        className="border-border shrink-0 border-b px-4 py-3"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm font-semibold tracking-tight">
              Choose a prompt
            </span>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {session.candidates.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void cancel()}
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        role="listbox"
        aria-label="Prompts"
        aria-activedescendant={`prompt-pick-option-${session.candidates[selectedIndex]?.id}`}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2"
      >
        {session.candidates.map((c, i) => (
          <button
            key={c.id}
            id={`prompt-pick-option-${c.id}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={i === selectedIndex}
            className={cn(
              "focus-visible:ring-ring group w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2",
              i === selectedIndex
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "text-foreground/80 hover:bg-muted/60 hover:text-foreground border-transparent",
            )}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => void confirm(i)}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors",
                  i === selectedIndex ? "bg-primary" : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.name}
              </span>
              {i < 9 && (
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] transition-colors",
                    i === selectedIndex
                      ? "text-primary/70"
                      : "text-muted-foreground/40",
                  )}
                >
                  {i + 1}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div
        className="border-border bg-muted/20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <KbdGroup>
              <Kbd className="bg-background/80 border-border text-foreground/70 border font-mono text-[10px]">
                ↑
              </Kbd>
              <Kbd className="bg-background/80 border-border text-foreground/70 border font-mono text-[10px]">
                ↓
              </Kbd>
            </KbdGroup>
            <span>Move up/down</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd className="bg-background/80 border-border text-foreground/70 border font-mono text-[10px]">
              Enter
            </Kbd>
            <span>Select and run prompt</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd className="bg-background/80 border-border text-foreground/70 border font-mono text-[10px]">
              Esc
            </Kbd>
            <span>Cancel</span>
          </span>
        </div>
      </div>
    </div>
  );
}
