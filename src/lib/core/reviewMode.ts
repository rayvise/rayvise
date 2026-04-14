import { emit } from "@tauri-apps/api/event";
import { getLLMClient } from "#/services/llm";
import {
  showReviewOverlay,
  REVIEW_STORAGE_KEY,
} from "#/services/overlayWindows";
import { saveCompletion } from "#/services/db";
import { ModeParams, isAbortError } from "./types";

// Review mode is used when the user wants to review the completion before applying it to the target app.
export async function runReviewMode(p: ModeParams) {
  // Do not activate the target app here: foregrounding Chrome (etc.) before the
  // review webview opens leaves keyboard focus outside Rayvise, so shortcuts
  // like ⌘↩ on the review window never fire. Focus returns to the target on
  // dismiss / apply / cancel via existing listeners.

  // Write loading state to localStorage, then open the review window
  localStorage.setItem(
    REVIEW_STORAGE_KEY,
    JSON.stringify({
      loading: true,
      originalText: p.selected_text,
      targetPid: p.target_pid,
      streamedText: "",
    }),
  );
  showReviewOverlay();

  let accumulatedText = "";

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
        },
      },
      p.apiKey,
      (chunk) => {
        accumulatedText += chunk;
        // Update localStorage so windows that open mid-stream get full text
        const stored = localStorage.getItem(REVIEW_STORAGE_KEY);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            data.streamedText = accumulatedText;
            localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(data));
          } catch {
            // ignore
          }
        }
        // Emit full accumulated text to avoid race-condition gaps
        emit("rayvise://stream-chunk", { text: accumulatedText }).catch(
          () => {},
        );
      },
      p.signal,
    );

    const durationMs = Date.now() - p.t0;

    await saveCompletion({
      id: p.completionId,
      timestamp: p.t0,
      inputText: p.selected_text,
      outputText: accumulatedText,
      finalText: null,
      wasApplied: 0,
      isReviewMode: 1,
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

    // Update localStorage to final ready state before signalling done
    localStorage.setItem(
      REVIEW_STORAGE_KEY,
      JSON.stringify({
        loading: false,
        completionId: p.completionId,
        completedText: accumulatedText,
        originalText: p.selected_text,
        targetPid: p.target_pid,
        durationMs,
      }),
    );
    await emit("rayvise://stream-done");
  } catch (err) {
    if (isAbortError(err)) {
      localStorage.removeItem(REVIEW_STORAGE_KEY);
      return;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    await emit("rayvise://stream-error", { message: errorMessage });
    localStorage.removeItem(REVIEW_STORAGE_KEY);

    await saveCompletion({
      id: p.completionId,
      timestamp: p.t0,
      inputText: p.selected_text,
      outputText: accumulatedText,
      finalText: null,
      wasApplied: 0,
      isReviewMode: 1,
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
