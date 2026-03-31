import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  SquarePen,
} from "lucide-react";
import type { CompletionEntry } from "#/services/db";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "#/components/ui/resizable";
import { toast } from "#/hooks/useToast";
import { cn } from "#/lib/utils";
import { usePromptsStore } from "#/stores";
import { getProviderLabel } from "#/services/llm/models";
import { type LLMProvider, LLM_PROVIDER } from "#/services/llm/types";
import {
  findWebsiteSiteIdForCompletion,
  promptSourceDisplayLabel,
  timeAgo,
} from "./helpers";

interface DetailDialogProps {
  row: CompletionEntry | null;
  onClose: () => void;
  appName: (id: string) => string;
  onNavigateToPrompt?: (promptId: string) => void;
  onNavigateToWebsiteSite?: (siteId: string) => void;
}

type ColumnKey = "input" | "output" | "final";

const EMPTY_OUTPUT = (
  <span className="text-muted-foreground/60 italic">empty</span>
);

const SHOW_HIDDEN_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "input", label: "Input" },
  { key: "output", label: "Output (original)" },
  { key: "final", label: "Final (edited)" },
];

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  } catch {
    toast.error("Could not copy");
  }
}

function ScrollablePreText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-foreground/80 min-h-0 flex-1 overflow-y-auto leading-relaxed whitespace-pre-wrap",
        className,
      )}
    >
      {children}
    </p>
  );
}

function SectionHeader({
  label,
  labelClassName,
  onCopy,
  visibility,
}: {
  label: string;
  labelClassName?: string;
  onCopy: () => void;
  visibility?: { onToggle: () => void };
}) {
  return (
    <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
      <p
        className={cn(
          "text-[10px] font-semibold tracking-widest uppercase",
          labelClassName ?? "text-muted-foreground/60",
        )}
      >
        {label}
      </p>
      <div className="flex shrink-0 items-center gap-0.5">
        {visibility && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={visibility.onToggle}
            aria-label={`Hide ${label}`}
            title="Hide column"
          >
            <Eye className="size-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          title="Copy to clipboard"
        >
          <Copy className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function countVisible(v: Record<ColumnKey, boolean>) {
  return (["input", "output", "final"] as const).filter((k) => v[k]).length;
}

function formatProviderLabel(provider: string): string {
  return Object.values(LLM_PROVIDER).includes(provider as LLMProvider)
    ? getProviderLabel(provider as LLMProvider)
    : provider;
}

function ResizableTwoColumn({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <>
      <ResizablePanel defaultSize={50} minSize={18} className="min-w-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden pr-1">
          {left}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={18} className="min-w-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden pl-1">
          {right}
        </div>
      </ResizablePanel>
    </>
  );
}

interface DetailDialogBodyProps {
  row: CompletionEntry;
  appName: (id: string) => string;
  onClose: () => void;
  onNavigateToPrompt?: (promptId: string) => void;
  onNavigateToWebsiteSite?: (siteId: string) => void;
}

function DetailDialogMetadataHeader({
  row,
  appName,
  onClose,
  onNavigateToPrompt,
  onNavigateToWebsiteSite,
}: DetailDialogBodyProps) {
  const { prompts, websitePromptSites } = usePromptsStore();
  const promptSourceLabel = promptSourceDisplayLabel(row.promptSource);
  const promptExists = prompts.some((p) => p.id === row.promptId);
  const websiteSiteId = useMemo(
    () =>
      findWebsiteSiteIdForCompletion(
        websitePromptSites,
        row.matchedWebsitePattern,
        row.promptId,
      ),
    [websitePromptSites, row.matchedWebsitePattern, row.promptId],
  );

  const goToPrompt =
    promptExists && onNavigateToPrompt
      ? () => {
          onClose();
          onNavigateToPrompt(row.promptId);
        }
      : undefined;

  const goToWebsite =
    websiteSiteId && onNavigateToWebsiteSite
      ? () => {
          onClose();
          onNavigateToWebsiteSite(websiteSiteId);
        }
      : undefined;

  return (
    <div className="border-border bg-muted/15 shrink-0 rounded-lg border px-3 py-2.5">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span>{appName(row.appId)}</span>
        <span>·</span>
        <span className="text-foreground inline-flex items-center gap-0.5">
          <span>{row.promptName}</span>
          {goToPrompt && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={goToPrompt}
              aria-label="Open prompt in sidebar"
              title="Open prompt"
            >
              <SquarePen className="size-3" />
            </Button>
          )}
        </span>
        {promptSourceLabel && (
          <>
            <span>·</span>
            <span>{promptSourceLabel}</span>
          </>
        )}
        <span>·</span>
        <span>{timeAgo(row.timestamp)}</span>
        {row.completionMs > 0 && (
          <>
            <span>·</span>
            <span>{(row.completionMs / 1000).toFixed(2)}s</span>
          </>
        )}
        <span>·</span>
        {row.isReviewMode ? (
          <span className="flex items-center gap-0.5 text-violet-500">
            Review
          </span>
        ) : (
          <span className="text-sky-500">Instant</span>
        )}
        <span>·</span>
        <span>{formatProviderLabel(row.provider)}</span>
        <span>·</span>
        <span className="font-mono">{row.model}</span>
      </div>

      {(row.matchedWebsitePattern || row.pageUrl) && (
        <div className="border-border mt-2 space-y-1.5 border-t pt-2">
          {row.matchedWebsitePattern && (
            <p className="text-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
              <span>Matched website prompt:</span>
              <span className="font-mono">{row.matchedWebsitePattern}</span>
              {goToWebsite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={goToWebsite}
                  aria-label="Open website prompt in sidebar"
                  title="Open website prompt"
                >
                  <Globe className="size-3" />
                </Button>
              )}
            </p>
          )}
          {row.pageUrl && (
            <p className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-[11px]">
              <span className="text-muted-foreground shrink-0">Page:</span>
              <a
                href={row.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-foreground/90 inline-flex min-w-0 items-start gap-1 underline-offset-2 hover:underline"
              >
                <span className="min-w-0 break-all">{row.pageUrl}</span>
                <ExternalLink
                  className="text-muted-foreground mt-0.5 size-3 shrink-0"
                  aria-hidden
                />
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailDialogBody({
  row,
  appName,
  onClose,
  onNavigateToPrompt,
  onNavigateToWebsiteSite,
}: DetailDialogBodyProps) {
  const hasFinal =
    !!row.isReviewMode &&
    row.finalText !== null &&
    row.finalText !== row.outputText;

  const [columnVisibility, setColumnVisibility] = useState<
    Record<ColumnKey, boolean>
  >({
    input: true,
    output: true,
    final: true,
  });

  const threeColumnMode = hasFinal && !row.hadError;

  const toggleColumn = useCallback((key: ColumnKey) => {
    setColumnVisibility((prev) => {
      if (prev[key] && countVisible(prev) === 1) {
        toast.info("At least one column must stay visible");
        return prev;
      }
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const threeColumnPanels = useMemo(() => {
    if (!row || !threeColumnMode) return null;

    type PanelDef = {
      key: ColumnKey;
      header: ReactNode;
      body: ReactNode;
    };

    const defs: PanelDef[] = [
      {
        key: "input",
        header: (
          <SectionHeader
            label="Input"
            onCopy={() => copyToClipboard(row.inputText, "input")}
            visibility={{ onToggle: () => toggleColumn("input") }}
          />
        ),
        body: <ScrollablePreText>{row.inputText}</ScrollablePreText>,
      },
      {
        key: "output",
        header: (
          <SectionHeader
            label="Output (original)"
            onCopy={() => copyToClipboard(row.outputText ?? "", "output")}
            visibility={{ onToggle: () => toggleColumn("output") }}
          />
        ),
        body: (
          <ScrollablePreText>
            {row.outputText || EMPTY_OUTPUT}
          </ScrollablePreText>
        ),
      },
      {
        key: "final",
        header: (
          <SectionHeader
            label="Final (edited)"
            onCopy={() => copyToClipboard(row.finalText ?? "", "final")}
            visibility={{ onToggle: () => toggleColumn("final") }}
          />
        ),
        body: <ScrollablePreText>{row.finalText}</ScrollablePreText>,
      },
    ];

    return defs.filter((d) => columnVisibility[d.key]);
  }, [row, threeColumnMode, columnVisibility, toggleColumn]);

  const inputColumn = (
    <>
      <SectionHeader
        label="Input"
        onCopy={() => copyToClipboard(row.inputText, "input")}
      />
      <ScrollablePreText>{row.inputText}</ScrollablePreText>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-xs">
      <DetailDialogMetadataHeader
        row={row}
        appName={appName}
        onClose={onClose}
        onNavigateToPrompt={onNavigateToPrompt}
        onNavigateToWebsiteSite={onNavigateToWebsiteSite}
      />

      {threeColumnMode &&
        threeColumnPanels &&
        countVisible(columnVisibility) < 3 && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
            <span className="shrink-0 font-medium">Show hidden:</span>
            {SHOW_HIDDEN_COLUMNS.filter(
              ({ key }) => !columnVisibility[key],
            ).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="xs"
                className="h-6 gap-1 px-2"
                onClick={() =>
                  setColumnVisibility((p) => ({ ...p, [key]: true }))
                }
              >
                <EyeOff className="size-3" />
                {label}
              </Button>
            ))}
          </div>
        )}

      <ResizablePanelGroup
        key={`${row.id}-${threeColumnMode ? JSON.stringify(columnVisibility) : "default"}`}
        orientation="horizontal"
        className="min-h-[min(440px,58vh)] w-full min-w-0 flex-1"
      >
        {threeColumnMode && threeColumnPanels ? (
          <>
            {threeColumnPanels.flatMap((panel, i) => {
              const per = 100 / threeColumnPanels.length;
              const nodes: (ReactNode | null)[] = [
                i > 0 ? (
                  <ResizableHandle key={`h-${panel.key}`} withHandle />
                ) : null,
                <ResizablePanel
                  key={panel.key}
                  defaultSize={per}
                  minSize={18}
                  className="min-w-0"
                >
                  <div
                    className={cn(
                      "flex h-full min-h-0 flex-col overflow-hidden",
                      panel.key === "input" && "pr-1",
                      panel.key === "output" && "px-1",
                      panel.key === "final" && "pl-1",
                    )}
                  >
                    {panel.header}
                    {panel.body}
                  </div>
                </ResizablePanel>,
              ];
              return nodes.filter(Boolean);
            })}
          </>
        ) : row.hadError ? (
          <ResizableTwoColumn
            left={inputColumn}
            right={
              <>
                <SectionHeader
                  label="Error"
                  labelClassName="text-red-600"
                  onCopy={() =>
                    copyToClipboard(row.errorMessage ?? "", "error")
                  }
                />
                <ScrollablePreText className="text-red-400">
                  {row.errorMessage}
                </ScrollablePreText>
              </>
            }
          />
        ) : (
          <ResizableTwoColumn
            left={inputColumn}
            right={
              <>
                <SectionHeader
                  label="Output"
                  onCopy={() => copyToClipboard(row.outputText ?? "", "output")}
                />
                <ScrollablePreText>
                  {row.outputText || EMPTY_OUTPUT}
                </ScrollablePreText>
              </>
            }
          />
        )}
      </ResizablePanelGroup>
    </div>
  );
}

export function DetailDialog({
  row,
  onClose,
  appName,
  onNavigateToPrompt,
  onNavigateToWebsiteSite,
}: DetailDialogProps) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground ring-border flex max-h-[90vh] w-full max-w-5xl flex-col ring-1 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm font-semibold">
            Details
          </DialogTitle>
        </DialogHeader>
        {row && (
          <DetailDialogBody
            key={row.id}
            row={row}
            appName={appName}
            onClose={onClose}
            onNavigateToPrompt={onNavigateToPrompt}
            onNavigateToWebsiteSite={onNavigateToWebsiteSite}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
