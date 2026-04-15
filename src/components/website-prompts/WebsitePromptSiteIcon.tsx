import { Globe, LoaderCircle } from "lucide-react";
import { cn } from "#/lib/utils";
import type { WebsitePromptSiteIconStatus } from "#/stores";

interface WebsitePromptSiteIconProps {
  iconSrc: string | null;
  iconStatus?: WebsitePromptSiteIconStatus;
  domain: string;
  className?: string;
  iconClassName?: string;
}

export function WebsitePromptSiteIcon({
  iconSrc,
  iconStatus = "idle",
  domain,
  className,
  iconClassName,
}: WebsitePromptSiteIconProps) {
  return (
    <div
      className={cn(
        "bg-muted/40 text-primary border-muted/90 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
        className,
        // Rayvise primary green color is too light and doesn't provide enough contrast in dark mode against lighter background
        domain.includes("rayvise") ? "dark:bg-white/20" : "dark:bg-white/90",
      )}
      aria-label={domain || "Website icon"}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className={cn(
            "h-5 w-5 shrink-0 object-contain [image-rendering:auto]",
            iconClassName,
          )}
        />
      ) : iconStatus === "loading" ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Globe className="h-4 w-4" />
      )}
    </div>
  );
}
