import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getLLMClient } from "#/services/llm";
import {
  INSTANT_PROGRESS_STORAGE_KEY,
  showProgressOverlay,
  showToastOverlay,
} from "#/services/overlayWindows";
import { saveCompletion } from "#/services/db";
import { ModeParams, isAbortError } from "./types";

// Instant mode is used when the user wants to apply the completion to the target app immediately.
export async function runInstantMode(p: ModeParams) {
  // Re-activate the target app before showing overlay — creating a WebviewWindow
  // briefly brings the Rayvise application to the foreground on macOS.
  await invoke("activate_app", { targetPid: p.target_pid }).catch(() => {});

  localStorage.setItem(
    INSTANT_PROGRESS_STORAGE_KEY,
    JSON.stringify({ loading: true, targetPid: p.target_pid }),
  );
  const progressWin = showProgressOverlay();

  let accumulatedText = "";
  const finishProgressOverlay = async () => {
    // Persist the finished state so an overlay that mounts late can self-close
    // instead of getting stuck with stale "processing" UI.
    localStorage.setItem(
      INSTANT_PROGRESS_STORAGE_KEY,
      JSON.stringify({ loading: false, targetPid: p.target_pid }),
    );
    if (progressWin) {
      progressWin.close().catch(() => {});
    }
    await emit("rayvise://instant-done");
  };

  try {
    await getLLMClient().stream(
      {
        messages: [
          { role: "instruction", content: p.prompt.text },
          { role: "user", content: p.selected_text },
        ],
        model: p.model,
        dryRunMetadata: {
          promptName: p.prompt.name,
          pageUrl: p.pageUrl,
          provider: p.provider,
        },
      },
      p.apiKey,
      (chunk) => {
        accumulatedText += chunk;
      },
      p.signal,
    );

    const durationMs = Date.now() - p.t0;

    await invoke("write_text_back", {
      text: accumulatedText,
      targetPid: p.target_pid,
    });

    await saveCompletion({
      id: p.completionId,
      timestamp: p.t0,
      inputText: p.selected_text,
      outputText: accumulatedText,
      finalText: null,
      wasApplied: 1,
      isReviewMode: 0,
      hadError: 0,
      errorMessage: null,
      inputTokens: null,
      outputTokens: null,
      completionMs: durationMs,
      appId: p.app,
      promptId: p.prompt.id,
      promptName: p.prompt.name,
      promptText: p.prompt.text,
      promptSource: p.promptSource,
      pageUrl: p.pageUrl,
      matchedWebsitePattern: p.matchedWebsitePattern,
      model: p.model,
      provider: p.provider,
    });
    await emit("rayvise://completion-saved");
    // Re-activate the target app before closing the overlay — when the overlay
    // window closes, macOS would otherwise focus the Rayvise main window.
    await invoke("activate_app", { targetPid: p.target_pid }).catch(() => {});
    await finishProgressOverlay();
  } catch (err) {
    if (isAbortError(err)) {
      await finishProgressOverlay();
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    await finishProgressOverlay();
    showToastOverlay(`Error: ${errorMessage}`, "error");

    await saveCompletion({
      id: p.completionId,
      timestamp: p.t0,
      inputText: p.selected_text,
      outputText: "",
      finalText: null,
      wasApplied: 0,
      isReviewMode: 0,
      hadError: 1,
      errorMessage,
      inputTokens: null,
      outputTokens: null,
      completionMs: Date.now() - p.t0,
      appId: p.app,
      promptId: p.prompt.id,
      promptName: p.prompt.name,
      promptText: p.prompt.text,
      promptSource: p.promptSource,
      pageUrl: p.pageUrl,
      matchedWebsitePattern: p.matchedWebsitePattern,
      model: p.model,
      provider: p.provider,
    }).catch(() => {});
  }
}
