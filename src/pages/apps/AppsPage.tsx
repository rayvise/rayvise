import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Ellipsis, EyeOff, Search, Settings2, X } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import { useAppsStore, usePromptsStore } from "#/stores";
import type { InstalledApp, Prompt } from "#/stores";
import { AppPromptCombobox } from "#/pages/apps/AppPromptCombobox";
import { useAppIcons } from "#/hooks/useAppIcons";

function formatPromptCount(count: number): string {
  return `${count} prompt${count === 1 ? "" : "s"}`;
}

interface AppsPageProps {
  onNavigateToSettings?: () => void;
}

export function AppsPage({ onNavigateToSettings }: AppsPageProps) {
  const { apps, setApps, hiddenAppBundleIds, hideApp } = useAppsStore();
  const { prompts, assignAppToPrompt, removeAppFromPrompt, unassignApp } =
    usePromptsStore();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(apps.length === 0);
  const iconSrcByBundleId = useAppIcons(apps);

  useEffect(() => {
    if (apps.length > 0) {
      return;
    }
    invoke<InstalledApp[]>("list_apps")
      .then((result) => {
        setApps(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apps.length, setApps]);

  const visibleApps = useMemo(
    () => apps.filter((app) => !hiddenAppBundleIds.includes(app.bundleId)),
    [apps, hiddenAppBundleIds],
  );
  const hiddenApps = useMemo(
    () => apps.filter((app) => hiddenAppBundleIds.includes(app.bundleId)),
    [apps, hiddenAppBundleIds],
  );

  const filtered = visibleApps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.bundleId.toLowerCase().includes(search.toLowerCase()),
  );

  const hiddenCount = hiddenApps.length;

  function assignedPromptsForBundle(bundleId: string): Prompt[] {
    return prompts.filter((p) => p.appIds.includes(bundleId));
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading apps...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-6 pb-6">
      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search apps..."
          className={cn(
            "border-border bg-muted/30 text-foreground w-full rounded-lg border py-2 pr-3 pl-9 text-sm",
            "placeholder:text-muted-foreground focus:border-ring focus:outline-none",
          )}
        />
      </div>

      {/* App list */}
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {visibleApps.length === 0 && hiddenCount > 0
              ? "All apps are currently hidden."
              : "No apps found."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((app) => {
              const assigned = assignedPromptsForBundle(app.bundleId);
              const addablePrompts = prompts.filter(
                (p) => !p.appIds.includes(app.bundleId),
              );
              return (
                <div
                  key={app.bundleId}
                  className={cn(
                    "border-border/70 bg-card/40 hover:border-border hover:bg-card/60 rounded-xl border px-3 py-2 transition-colors",
                    assigned.length > 0 && "shadow-xs",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/70 shadow-sm ring-1 ring-neutral-900/8 dark:bg-white/5 dark:ring-neutral-200/15">
                      {iconSrcByBundleId[app.bundleId] ? (
                        <img
                          src={iconSrcByBundleId[app.bundleId]}
                          alt=""
                          className="h-8 w-8 object-contain"
                        />
                      ) : (
                        <div className="bg-muted/50 h-8 w-8 rounded-lg" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center">
                      <p className="text-foreground mr-2 truncate text-sm font-medium">
                        {app.name}
                      </p>
                      <Badge
                        variant={assigned.length > 0 ? "secondary" : "outline"}
                        className="shrink-0"
                      >
                        {formatPromptCount(assigned.length)}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Open menu for ${app.name}`}
                      >
                        <Ellipsis className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => hideApp(app.bundleId)}>
                          <EyeOff className="mr-2 h-4 w-4" />
                          Hide app
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="bg-muted/20 mt-1 rounded-xl border border-dashed border-white/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-foreground/90 text-xs font-medium tracking-wide uppercase">
                        Mapped prompts
                      </p>
                      {assigned.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-muted-foreground hover:text-foreground h-auto px-0"
                          onClick={() => unassignApp(app.bundleId)}
                        >
                          Clear all
                        </Button>
                      ) : null}
                    </div>

                    {assigned.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assigned.map((p) => (
                          <span
                            key={p.id}
                            className="border-border bg-background/80 text-foreground inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm"
                          >
                            <span className="max-w-52 truncate">{p.name}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-full p-0.5 transition-colors"
                              aria-label={`Remove ${p.name}`}
                              onClick={() =>
                                removeAppFromPrompt(p.id, app.bundleId)
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground mt-2 text-xs font-light italic">
                        No prompts assigned yet. Add one below for quick access
                        when this app is active.
                      </p>
                    )}

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="w-full sm:max-w-80">
                        <AppPromptCombobox
                          key={`${app.bundleId}-${assigned.map((p) => p.id).join(",")}`}
                          prompts={addablePrompts}
                          assignedPromptId=""
                          onAssign={(promptId) => {
                            if (promptId) {
                              assignAppToPrompt(promptId, app.bundleId);
                            }
                          }}
                          placeholder={
                            addablePrompts.length > 0
                              ? "Add prompt..."
                              : "All prompts already assigned"
                          }
                          disabled={addablePrompts.length === 0}
                          showClear={false}
                          inputClassName="w-full min-w-0 max-w-none"
                        />
                      </div>
                      <p className="text-muted-foreground text-xs font-light">
                        {addablePrompts.length > 0
                          ? "Apps can map to multiple prompts."
                          : "No additional prompts available."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hiddenCount > 0 ? (
          <div className="border-border/70 bg-card/30 mt-4 flex items-center justify-between rounded-xl border px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {hiddenCount} hidden app{hiddenCount === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground text-xs">
                Manage hidden apps from Settings.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNavigateToSettings}
              className="shrink-0"
            >
              <Settings2 className="h-3.5 w-3.5" />
              View hidden apps
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
