import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { OVERLAY, parseOverlayType } from "#/lib/overlay";
import { cn } from "#/lib/utils";

const variantStyles: Record<string, string> = {
  error: "border-red-500/40 bg-red-950/90 text-red-200",
  success: "border-green-500/40 bg-green-950/90 text-green-200",
  info: "border-white/10 bg-neutral-900/95 text-neutral-200",
};

export function NotificationPage() {
  const params = new URLSearchParams(window.location.search);
  const overlay = parseOverlayType(params.get("overlay"));
  const message = params.get("message") ?? "";
  const variant = params.get("variant") ?? "info";
  const duration = Number(params.get("duration") ?? "3000");

  const win = getCurrentWebviewWindow();

  useEffect(() => {
    if (overlay !== OVERLAY.toast) {
      return;
    }

    const timer = setTimeout(() => win.close(), duration);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        win.close();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay, duration, win]);

  const containerClass = cn(
    "flex max-h-28 min-h-0 w-full max-w-full items-start gap-2 rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-md",
    variantStyles[variant] ?? variantStyles.info,
  );

  return (
    <div className="flex h-full w-full items-end justify-end bg-transparent p-2">
      <div className={containerClass}>
        <span className="min-w-0 flex-1 text-xs leading-snug wrap-break-word">
          Rayvise: {message}
        </span>
        {overlay === OVERLAY.toast && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <kbd
              onClick={() => win.close()}
              title="Dismiss"
              className="cursor-pointer rounded border border-current/20 bg-neutral-200 px-1 py-0.5 text-[10px] font-medium text-neutral-800 transition-opacity select-none hover:opacity-70"
            >
              Esc
            </kbd>
            <span className="text-[10px] text-neutral-200">to close</span>
          </div>
        )}
      </div>
    </div>
  );
}
