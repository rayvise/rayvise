import { invoke } from "@tauri-apps/api/core";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const LEGACY_KEY_PAIRS = [
  ["raypaste-settings", "rayvise-settings"],
  ["raypaste-prompts", "rayvise-prompts"],
  ["raypaste-apps", "rayvise-apps"],
] as const;

export function migrateLegacyLocalStorage(storage: StorageLike): void {
  applyLegacyValuesToStorage(
    storage,
    Object.fromEntries(
      LEGACY_KEY_PAIRS
        .map(([legacyKey]) => {
          const legacyValue = storage.getItem(legacyKey);
          return legacyValue === null ? null : [legacyKey, legacyValue];
        })
        .filter((entry): entry is [typeof LEGACY_KEY_PAIRS[number][0], string] => entry !== null),
    ),
  );
}

export function applyLegacyValuesToStorage(
  storage: StorageLike,
  legacyValues: Record<string, string>,
): boolean {
  let didWrite = false;

  for (const [legacyKey, currentKey] of LEGACY_KEY_PAIRS) {
    const currentValue = storage.getItem(currentKey);
    if (currentValue !== null && !isPristineCurrentValue(currentKey, currentValue)) {
      continue;
    }

    const legacyValue = legacyValues[legacyKey];
    if (legacyValue !== null) {
      storage.setItem(currentKey, legacyValue);
      didWrite = true;
    }
  }

  return didWrite;
}

export async function runLegacyMigrations(): Promise<void> {
  const nativeLegacyValues = await loadNativeLegacyLocalStorage();
  applyLegacyValuesToStorage(window.localStorage, nativeLegacyValues);
  migrateLegacyLocalStorage(window.localStorage);
}

export async function loadNativeLegacyLocalStorage(): Promise<Record<string, string>> {
  try {
    return await invoke<Record<string, string>>("load_legacy_local_storage");
  } catch {
    return {};
  }
}

function isPristineCurrentValue(key: string, value: string): boolean {
  const parsed = parsePersistedValue(value);
  if (!parsed || typeof parsed !== "object") {
    return true;
  }

  switch (key) {
    case "rayvise-settings":
      return isPristineSettingsState(parsed);
    case "rayvise-prompts":
      return isPristinePromptsState(parsed);
    case "rayvise-apps":
      return isPristineAppsState(parsed);
    default:
      return false;
  }
}

function parsePersistedValue(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const state = (parsed as { state?: unknown }).state;
    if (state && typeof state === "object") {
      return state as Record<string, unknown>;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isPristineSettingsState(state: Record<string, unknown>): boolean {
  return (
    typeof state.openrouterApiKey === "string" &&
    state.openrouterApiKey === "" &&
    typeof state.cerebrasApiKey === "string" &&
    state.cerebrasApiKey === "" &&
    typeof state.openaiApiKey === "string" &&
    state.openaiApiKey === "" &&
    state.reviewMode === false &&
    state.themeMode === "auto" &&
    state.mode === "direct"
  );
}

function isPristinePromptsState(state: Record<string, unknown>): boolean {
  const prompts = state.prompts;
  const websitePromptSites = state.websitePromptSites;

  return (
    Array.isArray(prompts) &&
    prompts.length === 0 &&
    Array.isArray(websitePromptSites) &&
    websitePromptSites.length === 0 &&
    state.defaultPromptId === null
  );
}

function isPristineAppsState(state: Record<string, unknown>): boolean {
  const hiddenAppBundleIds = state.hiddenAppBundleIds;
  return Array.isArray(hiddenAppBundleIds) && hiddenAppBundleIds.length === 0;
}
