import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  filterComboboxItems,
  useComboboxSearchDirty,
} from "#/hooks/useComboboxSearchDirty";
import { useAppsStore } from "#/stores";
import type { InstalledApp } from "#/stores";
import { useAppIcons } from "#/hooks/useAppIcons";
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxTrigger,
  useComboboxAnchor,
} from "#/components/ui/combobox";

function AppIcon({ src }: { src: string | undefined }) {
  return src ? (
    <img src={src} alt="" className="h-5 w-5 object-contain" />
  ) : (
    <div className="bg-muted/50 h-5 w-5 rounded" />
  );
}

interface PromptAppSelectorProps {
  assignedAppIds: string[];
  onChange: (newIds: string[]) => void;
}

export function PromptAppSelector({
  assignedAppIds,
  onChange,
}: PromptAppSelectorProps) {
  const { apps, setApps, hiddenAppBundleIds } = useAppsStore();
  const [query, setQuery] = useState("");
  const { searchDirty, onOpenChange, markSearchDirtyFromInput } =
    useComboboxSearchDirty();

  useEffect(() => {
    if (apps.length > 0) {
      return;
    }
    invoke<InstalledApp[]>("list_apps")
      .then(setApps)
      .catch(() => {});
  }, [apps.length, setApps]);

  const iconSrcByBundleId = useAppIcons(apps);

  const anchor = useComboboxAnchor();

  const hiddenSet = useMemo(
    () => new Set(hiddenAppBundleIds),
    [hiddenAppBundleIds],
  );
  const selectableApps = useMemo(
    () => apps.filter((a) => !hiddenSet.has(a.bundleId)),
    [apps, hiddenSet],
  );

  // Preserve order to match combobox chip index positions
  const assignedApps = assignedAppIds
    .map((id) => apps.find((a) => a.bundleId === id))
    .filter(Boolean) as InstalledApp[];

  const filteredApps = filterComboboxItems(
    selectableApps,
    query,
    searchDirty,
    (a) => a.name,
  );

  const allSelectableAssigned =
    selectableApps.length > 0 &&
    selectableApps.every((a) => assignedAppIds.includes(a.bundleId));

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Apps using this prompt
      </p>
      <Combobox
        multiple
        value={assignedAppIds}
        onValueChange={(newIds) => onChange(newIds ?? [])}
        onOpenChange={onOpenChange}
        onInputValueChange={(val) => setQuery(val)}
      >
        <ComboboxChips
          ref={anchor}
          className="border-border bg-muted/30 focus-within:border-ring min-h-10 rounded-lg"
        >
          {assignedApps.map((app) => (
            <ComboboxChip
              key={app.bundleId}
              className="flex items-center gap-1.5 p-1"
            >
              <AppIcon src={iconSrcByBundleId[app.bundleId]} />
              {app.name}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            placeholder="Search and add apps…"
            className="flex-1"
            onInput={markSearchDirtyFromInput}
          />
          <ComboboxTrigger className="text-muted-foreground ml-auto px-1" />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            {filteredApps.map((app) => (
              <ComboboxItem
                key={app.bundleId}
                value={app.bundleId}
                className="flex items-center gap-2 py-2 pl-3"
              >
                <AppIcon src={iconSrcByBundleId[app.bundleId]} />
                {app.name}
              </ComboboxItem>
            ))}
            {allSelectableAssigned && (
              <ComboboxEmpty>
                All available apps have been assigned.
              </ComboboxEmpty>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
