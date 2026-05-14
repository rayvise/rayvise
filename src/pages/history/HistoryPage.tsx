import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Search, Trash2 } from "lucide-react";
import { useAppsStore } from "#/stores";
import { Input } from "#/components/ui/input";
import {
  listCompletions,
  listDistinctPrompts,
  getUsageStats,
  deleteCompletion,
  clearAllCompletions,
  resetAllHistory,
  type CompletionEntry,
} from "#/services/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { EntryCard } from "#/pages/history/EntryCard";
import { DetailDialog } from "#/pages/history/DetailDialog";
import { OverviewPanel } from "#/pages/history/OverviewPanel";
import { useAppIcons } from "#/hooks/useAppIcons";

const LIST_LIMIT = 200;

interface HistoryPageProps {
  onNavigateToPrompt?: (promptId: string) => void;
  onNavigateToWebsiteSite?: (siteId: string) => void;
}

export function HistoryPage({
  onNavigateToPrompt,
  onNavigateToWebsiteSite,
}: HistoryPageProps = {}) {
  const [rows, setRows] = useState<CompletionEntry[]>([]);
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getUsageStats>
  > | null>(null);
  const [promptNames, setPromptNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailRow, setDetailRow] = useState<CompletionEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { apps } = useAppsStore();
  const iconSrcByBundleId = useAppIcons(apps);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appName = useCallback(
    (bundleId: string) =>
      apps.find((a) => a.bundleId === bundleId)?.name ?? bundleId,
    [apps],
  );
  const appIconSrc = useCallback(
    (bundleId: string) => iconSrcByBundleId[bundleId],
    [iconSrcByBundleId],
  );

  // Fetch data whenever refreshKey or debouncedSearch changes
  useEffect(() => {
    const query = debouncedSearch || undefined;
    Promise.all([
      listCompletions(LIST_LIMIT, 0, query),
      getUsageStats(),
      listDistinctPrompts(),
    ])
      .then(([fetched, s, names]) => {
        setRows(fetched);
        setStats(s);
        setPromptNames(
          Object.fromEntries(names.map((n) => [n.promptId, n.promptName])),
        );
      })
      .catch(() => {});
  }, [refreshKey, debouncedSearch]);

  // Refresh when a new completion is saved
  const doRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useEffect(() => {
    const unlisten = listen("rayvise://completion-saved", doRefresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [doRefresh]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  const handleDelete = (id: string | null) => {
    if (id) {
      deleteCompletion(id)
        .then(() => {
          setDeletingId(null);
          setRefreshKey((k) => k + 1);
        })
        .catch(() => {});
    }

    return;
  };

  const handleClearHistory = () => {
    clearAllCompletions()
      .then(() => setRefreshKey((k) => k + 1))
      .catch(() => {});
  };

  const handleResetAll = () => {
    resetAllHistory()
      .then(() => {
        setSearch("");
        setDebouncedSearch("");
        setRefreshKey((k) => k + 1);
      })
      .catch(() => {});
  };

  const isEmpty = !stats || stats.totalCompletions === 0;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ── */}
      <div className="border-border flex w-[42%] shrink-0 flex-col border-t border-r">
        {/* Search */}
        <div className="border-border shrink-0 border-b p-2">
          <div className="relative">
            <Search
              size={14}
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            />
            <Input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search history…"
              className="bg-muted/40 h-9 pl-9 text-[13px] focus-visible:ring-0"
            />
          </div>
        </div>

        {/* List */}
        {isEmpty ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-[13px]">
            No completions yet.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-[13px]">
            No results.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {rows.map((row) => (
              <EntryCard
                key={row.id}
                row={row}
                appName={appName}
                appIconSrc={appIconSrc}
                onClick={() => setDetailRow(row)}
                onDelete={() => setDeletingId(row.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-hidden">
        {stats ? (
          <OverviewPanel
            stats={stats}
            promptNames={promptNames}
            onClearHistory={handleClearHistory}
            onResetAll={handleResetAll}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-[13px]">
            Loading…
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <DetailDialog
        row={detailRow}
        onClose={() => setDetailRow(null)}
        appName={appName}
        appIconSrc={appIconSrc}
        onNavigateToPrompt={onNavigateToPrompt}
        onNavigateToWebsiteSite={onNavigateToWebsiteSite}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-muted/40">
              <Trash2 className="text-muted-foreground" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-[15px] font-semibold">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This log entry will be permanently removed. Stats are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDelete(deletingId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
