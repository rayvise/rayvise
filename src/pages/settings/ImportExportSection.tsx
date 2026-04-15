import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildExportPayload } from "#/lib/promptsImportExport";
import { usePromptsStore } from "#/stores";
import { Button } from "#/components/ui/button";
import { toast } from "#/hooks/useToast";
import { ExportDialog } from "./ExportDialog";
import { ImportExportDialog } from "./ImportExportDialog";

export function ImportExportSection() {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  async function handleExportAll() {
    const { prompts, websitePromptSites, defaultPromptId } =
      usePromptsStore.getState();
    const payload = buildExportPayload(
      prompts,
      websitePromptSites,
      defaultPromptId,
    );
    const dateStr = new Date().toISOString().slice(0, 10);
    const content = JSON.stringify(payload, null, 2);
    try {
      const saved = await invoke<boolean>("save_json_file", {
        defaultName: `rayvise-prompts-${dateStr}.json`,
        content,
      });
      if (saved) {
        toast.success(
          `Exported ${payload.prompts.length} prompt${payload.prompts.length !== 1 ? "s" : ""}`,
        );
      }
    } catch {
      toast.error("Failed to save file");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Import & Export</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Share prompts and app assignments across devices or with others.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportDialogOpen(true)}
        >
          <Upload className="mr-1.5 size-3.5" />
          Import
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExportDialogOpen(true)}
        >
          <Download className="mr-1.5 size-3.5" />
          Export
        </Button>
        <Button size="sm" variant="outline" onClick={handleExportAll}>
          <Download className="mr-1.5 size-3.5" />
          Export All
        </Button>
      </div>
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
      <ImportExportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </section>
  );
}
