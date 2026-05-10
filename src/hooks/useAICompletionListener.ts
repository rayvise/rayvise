import { useEffect, useRef, type MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import {
  usePromptsStore,
  useSettingsStore,
  type PromptResolution,
} from "#/stores";
import { getApiKey, providerRequiresApiKey } from "#/services/llm";
import {
  showToastOverlay,
  showPromptPickOverlay,
  PROMPT_PICK_STORAGE_KEY,
  type PendingPromptPickStorage,
  type PromptPickedEventPayload,
} from "#/services/overlayWindows";
import { updateCompletionOutcome } from "#/services/db";
import { runReviewMode } from "#/lib/core/reviewMode";
import { runInstantMode } from "#/lib/core/instantMode";
import { invoke } from "@tauri-apps/api/core";

interface HotkeyPayload {
  app: string;
  selected_text: string;
  target_pid: number;
  page_url?: string | null;
}

interface ReviewOutcomePayload {
  completionId: string;
  finalText: string | null;
  wasApplied: boolean;
  targetPid: number;
}

const BROWSER_APP_IDS = new Set([
  "com.apple.Safari",
  "company.thebrowser.Browser",
  "com.google.Chrome",
  "com.google.Chrome.canary",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.operasoftware.Opera",
  "org.mozilla.firefox",
  "org.mozilla.firefoxdeveloperedition",
]);

async function runCompletionPipeline(
  controller: AbortController,
  input: {
    selected_text: string;
    target_pid: number;
    app: string;
    resolution: PromptResolution;
    apiKey: string;
  },
  abortControllerRef: MutableRefObject<AbortController | null>,
) {
  const { signal } = controller;
  const { selected_text, target_pid, app, resolution, apiKey } = input;

  await useSettingsStore.persist.rehydrate();
  const { model, provider, reviewMode } = useSettingsStore.getState();

  const completionId = crypto.randomUUID();
  const t0 = Date.now();

  if (reviewMode) {
    await runReviewMode({
      signal,
      selected_text,
      target_pid,
      app,
      prompt: resolution.prompt,
      promptSource: resolution.source,
      pageUrl: resolution.pageUrl,
      matchedWebsitePattern: resolution.matchedWebsitePattern,
      model,
      provider,
      completionId,
      t0,
      apiKey,
    });
  } else {
    await runInstantMode({
      signal,
      selected_text,
      target_pid,
      app,
      prompt: resolution.prompt,
      promptSource: resolution.source,
      pageUrl: resolution.pageUrl,
      matchedWebsitePattern: resolution.matchedWebsitePattern,
      model,
      provider,
      completionId,
      t0,
      apiKey,
    });
  }

  if (abortControllerRef.current === controller) {
    abortControllerRef.current = null;
  }
}

export function useAICompletionListener() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const websitePromptHintedAppsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlistenHotkey = listen<HotkeyPayload>(
      "rayvise://hotkey-triggered",
      async (event) => {
        const { app, selected_text, target_pid, page_url } = event.payload;

        // A prompt-picker overlay is open; ignore duplicate hotkeys (often empty
        // selection once focus left the source app) until the user finishes or cancels.
        if (localStorage.getItem(PROMPT_PICK_STORAGE_KEY)) {
          return;
        }

        if (!selected_text.trim()) {
          showToastOverlay(
            "No text selected. Select some text and try again.",
            "error",
          );
          return;
        }

        const promptsState = usePromptsStore.getState();
        const hotkey = promptsState.resolveHotkeyPrompt(app, page_url);

        if (!hotkey) {
          showToastOverlay(
            "No prompt configured. Create one in New Prompt.",
            "error",
          );
          return;
        }

        if (
          promptsState.websitePromptSites.length > 0 &&
          !page_url &&
          BROWSER_APP_IDS.has(app) &&
          !websitePromptHintedAppsRef.current.has(app)
        ) {
          websitePromptHintedAppsRef.current.add(app);
          showToastOverlay(
            "Website prompts were unavailable for this tab, so Rayvise used your usual fallback prompt.",
            "info",
            4200,
          );
        }

        const apiKey = getApiKey();
        if (providerRequiresApiKey() && !apiKey) {
          showToastOverlay(
            "No API key set. Go to Settings to add one.",
            "error",
          );
          return;
        }

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          await emit("rayvise://abort-overlay");
        }

        if (hotkey.kind === "pick") {
          const sessionId = crypto.randomUUID();
          const payload: PendingPromptPickStorage = {
            sessionId,
            targetPid: target_pid,
            app,
            selected_text,
            page_url: page_url?.trim() || null,
            candidates: hotkey.candidates.map((c) => ({
              id: c.prompt.id,
              name: c.prompt.name,
              source: c.source,
              matchedWebsitePattern: c.matchedWebsitePattern,
            })),
          };
          localStorage.setItem(
            PROMPT_PICK_STORAGE_KEY,
            JSON.stringify(payload),
          );
          showPromptPickOverlay();
          return;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        await runCompletionPipeline(
          controller,
          {
            selected_text,
            target_pid,
            app,
            resolution: hotkey.resolution,
            apiKey,
          },
          abortControllerRef,
        );
      },
    );

    const unlistenPromptPicked = listen<PromptPickedEventPayload>(
      "rayvise://prompt-picked",
      async (event) => {
        const p = event.payload;

        const meta = p.candidates.find((c) => c.id === p.promptId);
        const prompt = usePromptsStore
          .getState()
          .prompts.find((pr) => pr.id === p.promptId);

        localStorage.removeItem(PROMPT_PICK_STORAGE_KEY);

        if (!meta || !prompt) {
          return;
        }

        const resolution: PromptResolution = {
          prompt,
          source: meta.source,
          pageUrl: p.page_url,
          matchedWebsitePattern: meta.matchedWebsitePattern,
        };

        const apiKey = getApiKey();
        if (providerRequiresApiKey() && !apiKey) {
          showToastOverlay(
            "No API key set. Go to Settings to add one.",
            "error",
          );
          return;
        }

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          await emit("rayvise://abort-overlay");
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        await runCompletionPipeline(
          controller,
          {
            selected_text: p.selected_text,
            target_pid: p.targetPid,
            app: p.app,
            resolution,
            apiKey,
          },
          abortControllerRef,
        );
      },
    );

    const unlistenPromptPickCancel = listen<{ targetPid: number }>(
      "rayvise://prompt-pick-cancel",
      async (event) => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        await invoke("activate_app", {
          targetPid: event.payload.targetPid,
        }).catch(() => {});
      },
    );

    const unlistenOutcome = listen<ReviewOutcomePayload>(
      "rayvise://review-outcome",
      async (event) => {
        const { completionId, finalText, wasApplied, targetPid } =
          event.payload;
        await updateCompletionOutcome(
          completionId,
          finalText,
          wasApplied,
        ).catch(() => {});
        // Restore focus to target app
        await invoke("activate_app", { targetPid }).catch(() => {});
      },
    );

    // User cancelled from review overlay during streaming
    const unlistenStreamCancel = listen<{ targetPid: number }>(
      "rayvise://stream-cancel",
      async (event) => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        // Restore focus to target app
        await invoke("activate_app", {
          targetPid: event.payload.targetPid,
        }).catch(() => {});
      },
    );

    // User cancelled from progress overlay during instant mode
    const unlistenInstantCancel = listen<{ targetPid: number }>(
      "rayvise://instant-cancel",
      async (event) => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        // Match review-mode cancellation behavior by returning focus to the
        // original target app after the instant-mode overlay is dismissed.
        await invoke("activate_app", {
          targetPid: event.payload.targetPid,
        }).catch(() => {});
      },
    );

    return () => {
      unlistenHotkey.then((fn) => fn());
      unlistenPromptPicked.then((fn) => fn());
      unlistenPromptPickCancel.then((fn) => fn());
      unlistenOutcome.then((fn) => fn());
      unlistenStreamCancel.then((fn) => fn());
      unlistenInstantCancel.then((fn) => fn());
    };
  }, []);
}

export { emit };
