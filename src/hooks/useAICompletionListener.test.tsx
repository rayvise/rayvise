import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAICompletionListener } from "./useAICompletionListener";
import { usePromptsStore, useSettingsStore } from "#/stores";
import { getApiKey, providerRequiresApiKey } from "#/services/llm";
import {
  showToastOverlay,
  PROMPT_PICK_STORAGE_KEY,
} from "#/services/overlayWindows";

const listeners = vi.hoisted(
  () => new Map<string, (e: { payload: unknown }) => void>(),
);
const runReviewMode = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const runInstantMode = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShowPromptPickOverlay = vi.hoisted(() => vi.fn(() => null));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return Promise.resolve(() => {});
  },
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/lib/core/reviewMode", () => ({
  runReviewMode: (...args: unknown[]) => runReviewMode(...args),
}));

vi.mock("#/lib/core/instantMode", () => ({
  runInstantMode: (...args: unknown[]) => runInstantMode(...args),
}));

vi.mock("#/services/llm", () => ({
  getApiKey: vi.fn(() => "test-api-key"),
  providerRequiresApiKey: vi.fn(() => true),
}));

vi.mock("#/services/overlayWindows", () => ({
  showToastOverlay: vi.fn(),
  showPromptPickOverlay: mockShowPromptPickOverlay,
  PROMPT_PICK_STORAGE_KEY: "rayvise-pending-prompt-pick",
}));

vi.mock("#/services/db", () => ({
  updateCompletionOutcome: vi.fn().mockResolvedValue(undefined),
}));

describe("useAICompletionListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    localStorage.clear();
    usePromptsStore.setState({
      prompts: [
        {
          id: "formal",
          name: "Formal",
          text: "Make this text more formal",
          notes: "",
          appIds: [],
          websitePromptSiteIds: [],
        },
      ],
      defaultPromptId: null,
      websitePromptSites: [],
    });
    useSettingsStore.setState({
      reviewMode: false,
      model: "m",
      provider: "openrouter" as const,
    });
    vi.spyOn(useSettingsStore.persist, "rehydrate").mockResolvedValue(
      undefined,
    );
  });

  it("runs instant mode when review mode is off", async () => {
    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.apple.Notes",
        selected_text: "hello",
        target_pid: 1,
        page_url: null,
      },
    });

    await waitFor(() => expect(runInstantMode).toHaveBeenCalled());
    expect(runReviewMode).not.toHaveBeenCalled();
  });

  it("shows error toast when no text selected", async () => {
    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.apple.Notes",
        selected_text: "   ",
        target_pid: 1,
      },
    });

    await waitFor(() =>
      expect(showToastOverlay).toHaveBeenCalledWith(
        "No text selected. Select some text and try again.",
        "error",
      ),
    );
    expect(runInstantMode).not.toHaveBeenCalled();
  });

  it("shows browser fallback info toast once per app when website prompts exist but page_url is missing", async () => {
    usePromptsStore.setState({
      websitePromptSites: [
        {
          id: "s1",
          domain: "x.com",
          iconSrc: null,
          iconStatus: "idle",
          rules: [
            {
              id: "r1",
              kind: "site",
              value: "",
              promptId: "formal",
              label: "",
            },
          ],
        },
      ],
    });

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    const fire = () =>
      listeners.get("rayvise://hotkey-triggered")!({
        payload: {
          app: "com.apple.Safari",
          selected_text: "hi",
          target_pid: 2,
          page_url: null,
        },
      });

    fire();
    await waitFor(() =>
      expect(showToastOverlay).toHaveBeenCalledWith(
        "Website prompts were unavailable for this tab, so Rayvise used your usual fallback prompt.",
        "info",
        4200,
      ),
    );

    vi.mocked(showToastOverlay).mockClear();
    fire();
    expect(showToastOverlay).not.toHaveBeenCalled();
  });

  it("shows error when no API key", async () => {
    vi.mocked(getApiKey).mockReturnValueOnce("");

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.apple.Notes",
        selected_text: "hello",
        target_pid: 1,
      },
    });

    await waitFor(() =>
      expect(showToastOverlay).toHaveBeenCalledWith(
        "No API key set. Go to Settings to add one.",
        "error",
      ),
    );
    expect(runInstantMode).not.toHaveBeenCalled();
  });

  it("does not require an API key for local provider completions", async () => {
    vi.mocked(getApiKey).mockReturnValueOnce("");
    vi.mocked(providerRequiresApiKey).mockReturnValueOnce(false);

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.apple.Notes",
        selected_text: "hello",
        target_pid: 1,
      },
    });

    await waitFor(() => expect(runInstantMode).toHaveBeenCalled());
    expect(showToastOverlay).not.toHaveBeenCalledWith(
      "No API key set. Go to Settings to add one.",
      "error",
    );
  });

  it("opens prompt picker when multiple app-mapped prompts match", async () => {
    const { addPrompt, assignAppToPrompt } = usePromptsStore.getState();
    addPrompt({ id: "m1", name: "M1", text: "a" });
    addPrompt({ id: "m2", name: "M2", text: "b" });
    assignAppToPrompt("m1", "com.multi");
    assignAppToPrompt("m2", "com.multi");

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.multi",
        selected_text: "hello",
        target_pid: 42,
        page_url: null,
      },
    });

    await waitFor(() => expect(mockShowPromptPickOverlay).toHaveBeenCalled());
    expect(runInstantMode).not.toHaveBeenCalled();
    expect(runReviewMode).not.toHaveBeenCalled();
  });

  it("ignores hotkey while prompt picker session is pending", async () => {
    localStorage.setItem(
      PROMPT_PICK_STORAGE_KEY,
      JSON.stringify({
        sessionId: "open",
        targetPid: 1,
        app: "com.x",
        selected_text: "x",
        page_url: null,
        candidates: [
          {
            id: "a",
            name: "A",
            source: "app",
            matchedWebsitePattern: null,
          },
        ],
      }),
    );

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://hotkey-triggered")).toBe(true),
    );

    listeners.get("rayvise://hotkey-triggered")!({
      payload: {
        app: "com.apple.Notes",
        selected_text: "hello",
        target_pid: 1,
        page_url: null,
      },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(runInstantMode).not.toHaveBeenCalled();
    expect(showToastOverlay).not.toHaveBeenCalled();
  });

  it("runs instant mode after prompt-picked with valid session", async () => {
    const { addPrompt, assignAppToPrompt } = usePromptsStore.getState();
    addPrompt({ id: "pick1", name: "Pick1", text: "system" });
    assignAppToPrompt("pick1", "com.x");

    renderHook(() => useAICompletionListener());

    await waitFor(() =>
      expect(listeners.has("rayvise://prompt-picked")).toBe(true),
    );

    listeners.get("rayvise://prompt-picked")!({
      payload: {
        sessionId: "sess-1",
        promptId: "pick1",
        targetPid: 7,
        app: "com.x",
        selected_text: "body",
        page_url: null,
        candidates: [
          {
            id: "pick1",
            name: "Pick1",
            source: "app",
            matchedWebsitePattern: null,
          },
        ],
      },
    });

    await waitFor(() => expect(runInstantMode).toHaveBeenCalled());
    expect(localStorage.getItem(PROMPT_PICK_STORAGE_KEY)).toBeNull();
  });
});
