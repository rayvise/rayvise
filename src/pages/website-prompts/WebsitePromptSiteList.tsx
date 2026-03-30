import { Globe } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { WebsitePromptSite } from "#/stores/promptsStore";
import { WebsitePromptSiteIcon } from "#/components/website-prompts/WebsitePromptSiteIcon";

interface WebsitePromptSiteListProps {
  sites: WebsitePromptSite[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  sitePromptSummary: (siteId: string) => string;
}

export function WebsitePromptSiteList({
  sites,
  selectedSiteId,
  onSelectSite,
  sitePromptSummary,
}: WebsitePromptSiteListProps) {
  if (sites.length === 0) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
        <Globe className="text-muted-foreground mb-3 h-5 w-5" />
        <p className="text-foreground text-sm font-medium">No websites yet</p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Add a website to start connecting prompts for use in your common
          workflows.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sites.map((site) => {
        const isSelected = site.id === selectedSiteId;
        return (
          <Button
            key={site.id}
            type="button"
            variant="ghost"
            onClick={() => onSelectSite(site.id)}
            className={cn(
              "h-auto min-h-0 w-full flex-col items-stretch rounded-xl border p-2 text-left font-normal",
              isSelected
                ? "border-primary/30 bg-primary/8"
                : "border-border bg-background/70",
            )}
          >
            <div className="flex items-center gap-3">
              <WebsitePromptSiteIcon
                iconSrc={site.iconSrc}
                iconStatus={site.iconStatus}
                domain={site.domain}
                iconClassName="h-[18px] w-[18px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {site.domain || "New website"}
                  </p>
                  <span className="bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                    {site.rules.length}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {sitePromptSummary(site.id)}
                </p>
              </div>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
