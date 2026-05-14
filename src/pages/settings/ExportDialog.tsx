import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type RowSelectionState,
  getCoreRowModel,
  flexRender,
  useReactTable,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "#/lib/utils";
import {
  buildPromptSearchIndex,
  filterAndSortPromptsByFuzzyQuery,
  type PromptSearchRow,
} from "#/lib/promptFuzzySearch";
import { buildExportPayloadForSelection } from "#/lib/promptsImportExport";
import { usePromptsStore, useAppsStore } from "#/stores";
import { toast } from "#/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "#/components/ui/dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Checkbox that supports the indeterminate visual state
function IndeterminateCheckbox({
  indeterminate,
  className,
  ...rest
}: { indeterminate?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false;
  }, [indeterminate]);
  return (
    <input
      type="checkbox"
      ref={ref}
      className={cn("accent-primary size-4 cursor-pointer rounded", className)}
      {...rest}
    />
  );
}

// Column definitions are stable (no closures capturing component state).
// Selection state is read from TanStack Table's instance args.
const columns: ColumnDef<PromptSearchRow>[] = [
  {
    id: "select",
    // Room for px-2 + 16px checkbox without overflowing into "Name"
    size: 44,
    header: ({ table }) => (
      <IndeterminateCheckbox
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <IndeterminateCheckbox
        checked={row.getIsSelected()}
        indeterminate={row.getIsSomeSelected()}
        onChange={row.getToggleSelectedHandler()}
        aria-label={`Select ${row.original.promptName}`}
      />
    ),
  },
  {
    accessorKey: "promptName",
    header: "Name",
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "contextLabel",
    header: "Assignment",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-xs">
        {getValue() as string}
      </span>
    ),
  },
];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { prompts, websitePromptSites, defaultPromptId } = usePromptsStore();
  const { apps } = useAppsStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset when dialog opens: select all prompts
  useEffect(() => {
    if (open) {
      const { prompts: current } = usePromptsStore.getState();
      setRowSelection(Object.fromEntries(current.map((p) => [p.id, true])));
      setSearchQuery("");
    }
  }, [open]);

  const searchIndex = useMemo(
    () => buildPromptSearchIndex(prompts, apps, websitePromptSites),
    [prompts, apps, websitePromptSites],
  );

  const filteredRows = useMemo(
    () => filterAndSortPromptsByFuzzyQuery(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  // Derive the set of selected IDs (across all rows, not just visible ones)
  const selectedIds = useMemo(
    () => new Set(Object.keys(rowSelection).filter((id) => rowSelection[id])),
    [rowSelection],
  );

  const exportPayload = useMemo(
    () =>
      buildExportPayloadForSelection(
        selectedIds,
        prompts,
        websitePromptSites,
        defaultPromptId,
      ),
    [selectedIds, prompts, websitePromptSites, defaultPromptId],
  );

  const jsonPreview = useMemo(
    () => JSON.stringify(exportPayload, null, 2),
    [exportPayload],
  );

  const selectedCount = selectedIds.size;
  const totalCount = prompts.length;

  async function handleSaveToFile() {
    if (selectedCount === 0) return;
    setIsSaving(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const saved = await invoke<boolean>("save_json_file", {
        defaultName: `rayvise-prompts-${dateStr}.json`,
        content: jsonPreview,
      });
      if (saved) {
        toast.success(
          `Exported ${selectedCount} prompt${selectedCount !== 1 ? "s" : ""}`,
        );
        onOpenChange(false);
      }
    } catch {
      toast.error("Failed to save file");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyJson() {
    if (selectedCount === 0) return;
    await navigator.clipboard.writeText(jsonPreview);
    toast.success("Copied to clipboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[640px] max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle>Export Prompts</DialogTitle>
        </DialogHeader>

        {/* Two-panel body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left — selector */}
          <div className="flex w-[380px] shrink-0 flex-col border-r">
            {/* Search */}
            <div className="shrink-0 border-b px-3 py-2">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search prompts…"
                  className="h-8 pl-8 text-sm"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                <thead className="bg-muted sticky top-0 z-10 shadow-[0_1px_0_0_var(--border)]">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className={cn(
                            "text-muted-foreground py-2 text-xs font-medium",
                            header.column.id === "select"
                              ? "w-11 px-2 text-center align-middle"
                              : "px-3 text-left align-middle",
                          )}
                          style={
                            header.column.columnDef.size != null
                              ? {
                                  width: header.column.columnDef.size,
                                  minWidth: header.column.columnDef.size,
                                }
                              : undefined
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="text-muted-foreground px-3 py-4 text-center text-xs"
                      >
                        No prompts match.
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={row.getToggleSelectedHandler()}
                        className={cn(
                          "hover:bg-muted/40 cursor-pointer border-b last:border-b-0",
                          row.getIsSelected() && "bg-muted/20",
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              "py-2 align-middle",
                              cell.column.id === "select"
                                ? "w-11 px-2 text-center"
                                : "px-3",
                            )}
                            onClick={
                              // Prevent double-toggle when clicking the checkbox itself
                              cell.column.id === "select"
                                ? (e) => e.stopPropagation()
                                : undefined
                            }
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right — JSON preview */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="text-muted-foreground shrink-0 border-b px-3 py-2 text-xs font-medium">
              JSON Preview
            </div>
            <div className="flex-1 overflow-auto">
              {selectedCount === 0 ? (
                <p className="text-muted-foreground px-4 py-4 text-xs">
                  Select at least one prompt to preview the export.
                </p>
              ) : (
                <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed whitespace-pre">
                  {jsonPreview}
                </pre>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none px-4 py-3">
          <span className="text-muted-foreground mr-auto self-center text-xs">
            {selectedCount} of {totalCount} prompt{totalCount !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <Button
            variant="outline"
            onClick={handleCopyJson}
            disabled={selectedCount === 0}
          >
            Copy JSON
          </Button>
          <Button
            onClick={handleSaveToFile}
            disabled={selectedCount === 0 || isSaving}
          >
            Save to File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
