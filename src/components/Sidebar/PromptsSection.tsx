import { useMemo, useState } from "react";
import { ChevronRight, Search, Star } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "#/components/ui/collapsible";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { usePromptsStore, useAppsStore } from "#/stores";
import type { Page } from "./SidebarNav";
import { useAppIcons } from "#/hooks/useAppIcons";
import { WebsitePromptSiteIcon } from "#/components/website-prompts/WebsitePromptSiteIcon";
import { Input } from "#/components/ui/input";
import {
  buildPromptSearchIndex,
  filterAndSortPromptsByFuzzyQuery,
} from "#/lib/promptFuzzySearch";

interface PromptsSectionProps {
  activePage: Page;
  selectedPromptId: string | null;
  selectedWebsitePromptSiteId: string | null;
  onNavigate: (
    page: Page,
    promptId?: string,
    websitePromptSiteId?: string,
  ) => void;
}

export function PromptsSection({
  activePage,
  selectedPromptId,
  selectedWebsitePromptSiteId,
  onNavigate,
}: PromptsSectionProps) {
  const { prompts, defaultPromptId, websitePromptSites } = usePromptsStore();
  const { apps } = useAppsStore();

  // App groups: prompts assigned to specific apps
  const appGroups = apps
    .map((app) => {
      const assignedPrompts = prompts.filter((p) =>
        p.appIds.includes(app.bundleId),
      );
      return { app, prompts: assignedPrompts };
    })
    .filter((g) => g.prompts.length > 0);

  const iconSrcByBundleId = useAppIcons(appGroups.map((g) => g.app));

  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);
  const resolvedOpenGroups =
    openGroups ?? new Set(appGroups.slice(0, 5).map((g) => g.app.bundleId));

  const websiteSitesWithPrompts = useMemo(
    () =>
      websitePromptSites.filter((site) =>
        prompts.some((p) => p.websitePromptSiteIds.includes(site.id)),
      ),
    [websitePromptSites, prompts],
  );

  const [openWebsiteGroups, setOpenWebsiteGroups] =
    useState<Set<string> | null>(null);
  const resolvedOpenWebsiteGroups =
    openWebsiteGroups ??
    new Set(websiteSitesWithPrompts.slice(0, 5).map((s) => s.id));

  function toggleGroup(groupId: string) {
    setOpenGroups((prev) => {
      const next = new Set(
        prev ?? appGroups.slice(0, 5).map((g) => g.app.bundleId),
      );
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function setWebsiteGroupOpen(siteId: string, nextOpen: boolean) {
    setOpenWebsiteGroups((prev) => {
      const next = new Set(
        prev ?? websiteSitesWithPrompts.slice(0, 5).map((s) => s.id),
      );
      if (nextOpen) {
        next.add(siteId);
      } else {
        next.delete(siteId);
      }
      return next;
    });
  }

  const unassignedPrompts = useMemo(
    () =>
      prompts.filter(
        (p) => p.appIds.length === 0 && p.websitePromptSiteIds.length === 0,
      ),
    [prompts],
  );

  const [searchQuery, setSearchQuery] = useState("");

  const promptSearchIndex = useMemo(
    () => buildPromptSearchIndex(prompts, apps, websitePromptSites),
    [prompts, apps, websitePromptSites],
  );

  const isSearching = searchQuery.trim().length > 0;

  const promptSearchResults = useMemo(
    () => filterAndSortPromptsByFuzzyQuery(promptSearchIndex, searchQuery),
    [promptSearchIndex, searchQuery],
  );

  if (prompts.length === 0 && websitePromptSites.length === 0) {
    return null;
  }

  function PromptItem({
    id,
    name,
    subtitle,
  }: {
    id: string;
    name: string;
    subtitle?: string;
  }) {
    const isSelected = selectedPromptId === id;
    const isDefault = defaultPromptId === id;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onNavigate("prompt", id)}
        className={cn(
          "h-auto w-full justify-start gap-1.5 py-1 pr-2 text-left text-[13px] font-normal",
          subtitle ? "pl-3" : "pl-8",
          isSelected
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0">
          <span className="w-full truncate">{name}</span>
          {subtitle ? (
            <span className="text-muted-foreground w-full truncate text-[11px] leading-tight">
              {subtitle}
            </span>
          ) : null}
        </span>
        {isDefault && (
          <Star className="fill-primary text-primary mr-1 h-2.5 w-2.5 shrink-0" />
        )}
      </Button>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {prompts.length > 0 ? (
        <div className="shrink-0">
          <p className="text-muted-foreground mb-1 px-3 text-xs tracking-wider select-none">
            Prompts
          </p>
          <div className="mb-2 px-2">
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts…"
                className="h-8 pl-8 text-sm"
                aria-label="Search prompts"
                name="prompts-sidebar-search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {isSearching ? (
          <div className="space-y-0.5">
            {promptSearchResults.length === 0 ? (
              <p className="text-muted-foreground px-3 py-1 text-sm">
                No prompts match.
              </p>
            ) : (
              promptSearchResults.map((row) => (
                <PromptItem
                  key={row.id}
                  id={row.id}
                  name={row.promptName}
                  subtitle={row.contextLabel}
                />
              ))
            )}
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              {/* App groups */}
              {appGroups.map(({ app, prompts: groupPrompts }) => {
                const isOpen = resolvedOpenGroups.has(app.bundleId);
                return (
                  <Collapsible
                    key={app.bundleId}
                    open={isOpen}
                    onOpenChange={() => toggleGroup(app.bundleId)}
                  >
                    <CollapsibleTrigger className="text-foreground/80 hover:bg-secondary hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] leading-snug font-medium transition-colors select-none">
                      {iconSrcByBundleId[app.bundleId] ? (
                        <img
                          src={iconSrcByBundleId[app.bundleId]}
                          alt=""
                          className="h-5 w-5 shrink-0 object-contain"
                        />
                      ) : (
                        <div className="bg-muted/50 h-5 w-5 shrink-0 rounded-sm" />
                      )}
                      <span className="truncate">{app.name}</span>
                      <ChevronRight
                        className={cn(
                          "ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                          isOpen && "rotate-90",
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-0.5 space-y-0.5">
                        {groupPrompts.map((prompt) => (
                          <PromptItem
                            key={prompt.id}
                            id={prompt.id}
                            name={prompt.name}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Unassigned: no app and no website rule referencing this prompt */}
              {unassignedPrompts.length > 0 && (
                <Collapsible
                  open={resolvedOpenGroups.has("__unassigned__")}
                  onOpenChange={() => toggleGroup("__unassigned__")}
                >
                  <CollapsibleTrigger className="text-foreground/80 hover:bg-secondary hover:text-foreground flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[13px] leading-snug font-medium transition-colors select-none">
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                        resolvedOpenGroups.has("__unassigned__") && "rotate-90",
                      )}
                    />
                    <span>Unassigned</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-0.5 space-y-0.5">
                      {unassignedPrompts.map((prompt) => (
                        <PromptItem
                          key={prompt.id}
                          id={prompt.id}
                          name={prompt.name}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {!isSearching && websitePromptSites.length > 0 && (
              <div className="mt-4">
                <p className="text-muted-foreground mb-1 px-3 text-xs font-semibold tracking-wider uppercase select-none">
                  Website prompts
                </p>
                <div className="space-y-0.5">
                  {websitePromptSites.map((site) => {
                    const sitePrompts = prompts.filter((p) =>
                      p.websitePromptSiteIds.includes(site.id),
                    );
                    const isSelected =
                      activePage === "website-prompts" &&
                      selectedWebsitePromptSiteId === site.id;
                    const isOpen = resolvedOpenWebsiteGroups.has(site.id);

                    if (sitePrompts.length === 0) {
                      return (
                        <Button
                          key={site.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onNavigate("website-prompts", undefined, site.id)
                          }
                          className={cn(
                            "h-auto w-full justify-start gap-2 px-3 py-1.5 text-left text-[13px] font-normal",
                            isSelected
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          <WebsitePromptSiteIcon
                            iconSrc={site.iconSrc}
                            iconStatus={site.iconStatus}
                            domain={site.domain}
                            className="h-6 w-6 rounded-md border-none bg-transparent shadow-none"
                            iconClassName="h-4 w-4"
                          />
                          <span className="flex-1 truncate">
                            {site.domain || "New website"}
                          </span>
                          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                            {site.rules.length}
                          </span>
                        </Button>
                      );
                    }

                    return (
                      <Collapsible
                        key={site.id}
                        open={isOpen}
                        onOpenChange={(next) =>
                          setWebsiteGroupOpen(site.id, next)
                        }
                      >
                        <div
                          className={cn(
                            "flex w-full min-w-0 items-stretch gap-0 rounded-md",
                            isSelected
                              ? "bg-secondary"
                              : "hover:bg-secondary/80",
                          )}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onNavigate("website-prompts", undefined, site.id)
                            }
                            className={cn(
                              "h-auto min-w-0 flex-1 justify-start gap-2 rounded-r-none px-3 py-1.5 text-left text-[13px] font-normal",
                              isSelected
                                ? "text-foreground hover:bg-transparent"
                                : "text-muted-foreground hover:text-foreground hover:bg-transparent",
                            )}
                          >
                            <WebsitePromptSiteIcon
                              iconSrc={site.iconSrc}
                              iconStatus={site.iconStatus}
                              domain={site.domain}
                              className="h-6 w-6 rounded-md border-none bg-transparent shadow-none"
                              iconClassName="h-4 w-4"
                            />
                            <span className="flex-1 truncate">
                              {site.domain || "New website"}
                            </span>
                            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                              {site.rules.length}
                            </span>
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-auto w-8 shrink-0 rounded-l-none px-0",
                                isSelected
                                  ? "text-foreground hover:bg-transparent"
                                  : "text-foreground/80 hover:text-foreground hover:bg-transparent",
                              )}
                              aria-label={
                                isOpen
                                  ? "Hide prompts for this site"
                                  : "Show prompts for this site"
                              }
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                                  isOpen && "rotate-90",
                                )}
                              />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent>
                          <div className="mt-0.5 space-y-0.5">
                            {sitePrompts.map((prompt) => (
                              <PromptItem
                                key={prompt.id}
                                id={prompt.id}
                                name={prompt.name}
                              />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
