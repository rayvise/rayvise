import { useState } from "react";
import { BarChart2, MessageSquare, X, Trash2 } from "lucide-react";
import type { UsageStatsRow } from "#/services/db";
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
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { avgTokPerSec, avgCompletionTime } from "./helpers";

function ClearHistoryDialog({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="border-border bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground gap-2 px-4 py-2 text-[12px] font-normal"
          />
        }
      >
        <X size={12} />
        Clear history
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted/40">
            <X className="text-muted-foreground" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-[15px] font-semibold">
            Clear history?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            All log entries will be permanently deleted. Overview stats are
            preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetAllDialog({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="destructive"
            className="border-destructive/30 bg-destructive/10 text-destructive/70 hover:border-destructive/50 hover:bg-destructive/20 hover:text-destructive gap-2 px-4 py-2 text-[12px] font-normal"
          />
        }
      >
        <Trash2 size={12} />
        Reset all data
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-red-500/10">
            <Trash2 className="text-red-400" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-[15px] font-semibold">
            Reset all data?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Permanently deletes all log entries{" "}
            <span className="text-foreground/80">and</span> resets all stats to
            zero. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Reset everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface OverviewPanelProps {
  stats: UsageStatsRow;
  promptNames: Record<string, string>;
  onClearHistory: () => void;
  onResetAll: () => void;
}

export function OverviewPanel({
  stats,
  promptNames,
  onClearHistory,
  onResetAll,
}: OverviewPanelProps) {
  const mostUsedPromptId =
    Object.keys(stats.promptStats).sort(
      (a, b) =>
        (stats.promptStats[b]?.uses ?? 0) - (stats.promptStats[a]?.uses ?? 0),
    )[0] ?? null;
  const mostUsedPromptName = mostUsedPromptId
    ? (promptNames[mostUsedPromptId] ?? mostUsedPromptId)
    : "—";

  const promptEntries = Object.entries(stats.promptStats).sort(
    ([, a], [, b]) => b.uses - a.uses,
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto border-t px-6 py-5">
      {/* OVERVIEW */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <BarChart2 size={13} className="text-muted-foreground" />
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Overview
          </h3>
        </div>
        <div className="border-border bg-muted/20 overflow-hidden rounded-xl border">
          {(
            [
              { label: "Total Completions", value: stats.totalCompletions },
              { label: "Avg. Tokens / sec", value: avgTokPerSec(stats) },
              {
                label: "Avg. Completion Time",
                value: avgCompletionTime(stats),
              },
              { label: "Most Used Prompt", value: mostUsedPromptName },
            ] as { label: string; value: string | number }[]
          ).map(({ label, value }, i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-border border-t" : ""}`}
            >
              <span className="text-foreground/80 text-[13px]">{label}</span>
              <span className="text-foreground text-[13px] font-medium">
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* PER PROMPT */}
      {promptEntries.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare size={13} className="text-muted-foreground" />
            <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
              Per Prompt
            </h3>
          </div>
          <div className="border-border bg-muted/20 overflow-hidden rounded-xl border">
            {promptEntries.map(([id, data], i) => (
              <div
                key={id}
                className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-border border-t" : ""}`}
              >
                <span className="text-foreground/80 truncate text-[13px]">
                  {promptNames[id] ?? id}
                </span>
                <span className="text-foreground ml-4 shrink-0 text-[13px] font-medium">
                  {data.uses}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="mt-auto flex justify-end gap-2 pt-2">
        <ClearHistoryDialog onConfirm={onClearHistory} />
        <ResetAllDialog onConfirm={onResetAll} />
      </section>
    </div>
  );
}
