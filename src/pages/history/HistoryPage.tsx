import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useReducer,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { Search, Trash2 } from "lucide-react";
import { useAppsStore } from "#/stores";
import { Input } from "#/components/ui/input";
import {
  listCompletions,
  listDistinctPrompts,
  getUsageStats,
  getCompletion,
  deleteCompletion,
  clearAllCompletions,
  resetAllHistory,
  type CompletionEntry,
  type CompletionListEntry,
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

type DetailFetchStatus = "idle" | "loading" | "ready" | "not_found";

interface DetailState {
  id: string | null;
  row: CompletionEntry | null;
  status: DetailFetchStatus;
}

type DetailAction =
  | { type: "open"; id: string }
  | { type: "close" }
  | {
      type: "resolve";
      requestId: string;
      row: CompletionEntry | null;
    };

const initialDetail: DetailState = {
  id: null,
  row: null,
  status: "idle",
};

function detailReducer(state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case "open":
      return { id: action.id, row: null, status: "loading" };
    case "close":
      return initialDetail;
    case "resolve":
      if (state.id !== action.requestId) {
        return state;
      }
      if (action.row) {
        return { ...state, row: action.row, status: "ready" };
      }
      return { ...state, row: null, status: "not_found" };
    default:
      return state;
  }
}

interface HistoryPageProps {
  onNavigateToPrompt?: (promptId: string) => void;
  onNavigateToWebsiteSite?: (siteId: string) => void;
}

export function HistoryPage({
  onNavigateToPrompt,
  onNavigateToWebsiteSite,
}: HistoryPageProps = {}) {
  const [rows, setRows] = useState<CompletionListEntry[]>([]);
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof getUsageStats>
  > | null>(null);
  const [promptNames, setPromptNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, dispatchDetail] = useReducer(detailReducer, initialDetail);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { apps } = useAppsStore();
  const detailIdForStaleDeleteRef = useRef<string | null>(null);

  useEffect(() => {
    detailIdForStaleDeleteRef.current = detail.id;
  }, [detail.id]);

  const appsForHistoryIcons = useMemo(() => {
    const ids = new Set(rows.map((r) => r.appId));
    return apps.filter((a) => ids.has(a.bundleId));
  }, [rows, apps]);

  const iconSrcByBundleId = useAppIcons(appsForHistoryIcons);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appNameByBundleId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of apps) {
      m.set(a.bundleId, a.name);
    }
    return m;
  }, [apps]);

  const appName = useCallback(
    (bundleId: string) => appNameByBundleId.get(bundleId) ?? bundleId,
    [appNameByBundleId],
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

  // Load full completion when a row is selected (async updates only)
  useEffect(() => {
    if (!detail.id) {
      return;
    }

    const requestId = detail.id;
    let cancelled = false;

    getCompletion(requestId)
      .then((row) => {
        if (cancelled) {
          return;
        }
        dispatchDetail({ type: "resolve", requestId, row });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        dispatchDetail({ type: "resolve", requestId, row: null });
      });

    return () => {
      cancelled = true;
    };
  }, [detail.id]);

  // Refresh when a new completion is saved
  const doRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useEffect(() => {
    const unlisten = listen("rayvise://completion-saved", doRefresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [doRefresh]);

  const closeDetail = useCallback(() => {
    dispatchDetail({ type: "close" });
  }, []);

  const openDetail = useCallback((id: string) => {
    dispatchDetail({ type: "open", id });
  }, []);

  const requestDelete = useCallback((id: string) => {
    setDeletingId(id);
  }, []);

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
          if (detailIdForStaleDeleteRef.current === id) {
            dispatchDetail({ type: "close" });
          }
          setRefreshKey((k) => k + 1);
        })
        .catch(() => {});
    }

    return;
  };

  const handleClearHistory = () => {
    clearAllCompletions()
      .then(() => {
        closeDetail();
        setRefreshKey((k) => k + 1);
      })
      .catch(() => {});
  };

  const handleResetAll = () => {
    resetAllHistory()
      .then(() => {
        setSearch("");
        setDebouncedSearch("");
        closeDetail();
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
                onOpenDetail={openDetail}
                onDelete={requestDelete}
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
        selectedId={detail.id}
        detailStatus={detail.status}
        detailRow={detail.row}
        onClose={closeDetail}
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
