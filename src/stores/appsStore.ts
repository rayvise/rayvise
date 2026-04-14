import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface InstalledApp {
  name: string;
  bundleId: string;
  /** Path to already-converted cached PNG. Present on warm cache hits. */
  iconPath?: string;
  /** Path to raw .icns file. Present when PNG is not yet cached. */
  icnsPath?: string;
}

interface AppsState {
  apps: InstalledApp[];
  activeApp: string | null;
  hiddenAppBundleIds: string[];
  setApps: (apps: InstalledApp[]) => void;
  setActiveApp: (appId: string | null) => void;
  hideApp: (appId: string) => void;
  unhideApp: (appId: string) => void;
}

export const useAppsStore = create<AppsState>()(
  persist(
    (set) => ({
      apps: [],
      activeApp: null,
      hiddenAppBundleIds: [],
      setApps: (apps) =>
        set((state) => {
          const bundleIds = new Set(apps.map((a) => a.bundleId));
          const hiddenAppBundleIds = state.hiddenAppBundleIds.filter((id) =>
            bundleIds.has(id),
          );
          return { apps, hiddenAppBundleIds };
        }),
      setActiveApp: (activeApp) => set({ activeApp }),
      hideApp: (appId) =>
        set((state) => ({
          hiddenAppBundleIds: state.hiddenAppBundleIds.includes(appId)
            ? state.hiddenAppBundleIds
            : [...state.hiddenAppBundleIds, appId],
        })),
      unhideApp: (appId) =>
        set((state) => ({
          hiddenAppBundleIds: state.hiddenAppBundleIds.filter(
            (bundleId) => bundleId !== appId,
          ),
        })),
    }),
    {
      name: "rayvise-apps",
      partialize: (state) => ({
        hiddenAppBundleIds: state.hiddenAppBundleIds,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AppsState> & {
          hiddenAppBundleIds?: unknown;
        };

        return {
          ...currentState,
          hiddenAppBundleIds: Array.isArray(persisted.hiddenAppBundleIds)
            ? [...new Set(persisted.hiddenAppBundleIds.filter(isString))]
            : currentState.hiddenAppBundleIds,
        };
      },
    },
  ),
);

function isString(value: unknown): value is string {
  return typeof value === "string";
}
