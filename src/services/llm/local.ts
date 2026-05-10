import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "#/stores";
import { chatCompletionBody } from "./chatCompletionBody";
import { createThinkBlockStripper } from "./streaming";
import { LLM_PROVIDER, type LLMClient, type LLMRequest } from "./types";

interface LocalStreamEvent {
  sessionId: string;
  text: string;
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function localSettings() {
  const { localBaseUrl, localApiKey } = useSettingsStore.getState();
  return { baseUrl: localBaseUrl, apiKey: localApiKey };
}

export async function listLocalModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return await invoke<string[]>("list_local_models", {
    baseUrl,
    apiKey,
  });
}

export const localClient: LLMClient = {
  async complete(req: LLMRequest, _apiKey: string, signal?: AbortSignal) {
    let text = "";
    await this.stream(
      req,
      _apiKey,
      (chunk) => {
        text += chunk;
      },
      signal,
    );

    return {
      text,
      usage: {
        input_tokens: null,
        output_tokens: null,
      },
    };
  },

  async stream(
    req: LLMRequest,
    _apiKey: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      throw abortError();
    }

    const sessionId = crypto.randomUUID();
    const { baseUrl, apiKey } = localSettings();
    const stripper = createThinkBlockStripper();
    const unlisten = await listen<LocalStreamEvent>(
      "rayvise://local-llm-stream",
      (event) => {
        if (event.payload.sessionId !== sessionId) {
          return;
        }

        const text = stripper.push(event.payload.text);
        if (text) {
          onChunk(text);
        }
      },
    );

    const cancel = () => {
      invoke("cancel_local_chat_completion", { sessionId }).catch(() => {});
    };
    let didAbort = false;
    let rejectAbort: (err: DOMException) => void = () => {};
    const abortPromise = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const abortHandler = () => {
      didAbort = true;
      cancel();
      rejectAbort(abortError());
    };
    signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const commandPromise = invoke("stream_local_chat_completion", {
        sessionId,
        baseUrl,
        apiKey,
        body: chatCompletionBody(LLM_PROVIDER.Local, req, true),
      }).catch((err) => {
        if (didAbort || signal?.aborted) {
          return;
        }

        throw err;
      });

      await Promise.race([commandPromise, abortPromise]);

      const remaining = stripper.flush();
      if (remaining) {
        onChunk(remaining);
      }
    } catch (err) {
      if (signal?.aborted) {
        throw abortError();
      }

      throw err;
    } finally {
      signal?.removeEventListener("abort", abortHandler);
      unlisten();
    }
  },
};
