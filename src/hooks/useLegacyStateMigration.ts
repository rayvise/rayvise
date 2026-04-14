import { useEffect } from "react";
import { useAppsStore, usePromptsStore, useSettingsStore } from "#/stores";
import {
  applyLegacyValuesToStorage,
  loadNativeLegacyLocalStorage,
} from "#/lib/legacyMigration";

export function useLegacyStateMigration() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const legacyValues = await loadNativeLegacyLocalStorage();
      if (cancelled) {
        return;
      }

      const didWrite = applyLegacyValuesToStorage(
        window.localStorage,
        legacyValues,
      );
      if (!didWrite) {
        return;
      }

      await Promise.all([
        useSettingsStore.persist.rehydrate(),
        usePromptsStore.persist.rehydrate(),
        useAppsStore.persist.rehydrate(),
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
