import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "#/lib/utils";
import { Button } from "#/components/ui/button";
import { usePromptsStore } from "#/stores";
import { PromptAppSelector } from "#/pages/prompts/PromptAppSelector";
import { fetchWebsiteIcon } from "#/services/websiteIcons";
import {
  type NewPromptPagePrefill,
  suggestPromptNameFromDomain,
} from "#/pages/prompts/newPromptPageTypes";
import {
  normalizeDomainInput,
  normalizePathPrefixInput,
} from "#/stores/promptsStore";

interface NewPromptPageProps {
  onCreated: (id: string) => void;
  prefill?: NewPromptPagePrefill | null;
}

function applyPrefill(prefill?: NewPromptPagePrefill | null) {
  const websiteDomain = prefill?.website?.domain ?? "";
  return {
    name: prefill?.name ?? suggestPromptNameFromDomain(websiteDomain),
    text: prefill?.text ?? "",
    notes: prefill?.notes ?? "",
    selectedAppIds: prefill?.selectedAppIds ?? [],
    websiteEnabled: Boolean(prefill?.website?.enabled),
    websiteSiteId: prefill?.website?.siteId ?? null,
    websiteRuleId: prefill?.website?.ruleId ?? null,
    websiteDomain,
    websiteRuleKind: prefill?.website?.ruleKind ?? ("site" as const),
    websitePathPrefix: prefill?.website?.pathPrefix ?? "",
  };
}

export function NewPromptPage({ onCreated, prefill }: NewPromptPageProps) {
  const {
    addPrompt,
    assignAppToPrompt,
    websitePromptSites,
    addWebsitePromptSite,
    updateWebsitePromptSite,
    addWebsitePromptSiteRule,
    updateWebsitePromptSiteRule,
    fetchWebsitePromptSiteIcon,
  } = usePromptsStore();
  const [name, setName] = useState(() => applyPrefill(prefill).name);
  const [text, setText] = useState(() => applyPrefill(prefill).text);
  const [notes, setNotes] = useState(() => applyPrefill(prefill).notes);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>(
    () => applyPrefill(prefill).selectedAppIds,
  );
  const [websiteEnabled, setWebsiteEnabled] = useState(
    () => applyPrefill(prefill).websiteEnabled,
  );
  const [websiteSiteId] = useState<string | null>(
    () => applyPrefill(prefill).websiteSiteId,
  );
  const [websiteRuleId] = useState<string | null>(
    () => applyPrefill(prefill).websiteRuleId,
  );
  const [websiteDomain, setWebsiteDomain] = useState(
    () => applyPrefill(prefill).websiteDomain,
  );
  const [websiteRuleKind, setWebsiteRuleKind] = useState<
    "site" | "path-prefix"
  >(() => applyPrefill(prefill).websiteRuleKind);
  const [websitePathPrefix, setWebsitePathPrefix] = useState(
    () => applyPrefill(prefill).websitePathPrefix,
  );

  const normalizedWebsiteDomain = normalizeDomainInput(websiteDomain);
  const normalizedWebsitePathPrefix =
    websiteRuleKind === "path-prefix"
      ? normalizePathPrefixInput(websitePathPrefix, normalizedWebsiteDomain)
      : "";
  const websiteConfigValid =
    !websiteEnabled ||
    (!!normalizedWebsiteDomain &&
      (websiteRuleKind === "site" || !!normalizedWebsitePathPrefix));

  function handleSave() {
    if (!name.trim() || !text.trim() || !websiteConfigValid) {
      return;
    }

    const id = crypto.randomUUID();
    addPrompt({
      id,
      name: name.trim(),
      text: text.trim(),
      notes: notes.trim(),
    });
    for (const appId of selectedAppIds) {
      assignAppToPrompt(id, appId);
    }

    if (websiteEnabled && normalizedWebsiteDomain) {
      let siteId =
        (websiteSiteId &&
          websitePromptSites.find((site) => site.id === websiteSiteId)?.id) ??
        websitePromptSites.find(
          (site) => site.domain === normalizedWebsiteDomain,
        )?.id ??
        null;

      if (!siteId) {
        siteId = addWebsitePromptSite();
      }

      updateWebsitePromptSite(siteId, { domain: normalizedWebsiteDomain });

      const site = usePromptsStore
        .getState()
        .websitePromptSites.find((item) => item.id === siteId);

      let targetRuleId =
        websiteRuleId && site?.rules.some((rule) => rule.id === websiteRuleId)
          ? websiteRuleId
          : null;

      if (!targetRuleId) {
        const reusableRule = site?.rules.find((rule) => {
          if (rule.kind !== websiteRuleKind || rule.promptId) {
            return false;
          }
          if (websiteRuleKind === "site") {
            return true;
          }
          return !rule.value || rule.value === normalizedWebsitePathPrefix;
        });
        targetRuleId = reusableRule?.id ?? null;
      }

      if (!targetRuleId) {
        targetRuleId = addWebsitePromptSiteRule(siteId, {
          kind: websiteRuleKind,
        });
      }

      updateWebsitePromptSiteRule(siteId, targetRuleId, {
        kind: websiteRuleKind,
        promptId: id,
        value:
          websiteRuleKind === "path-prefix" ? normalizedWebsitePathPrefix : "",
      });
      void fetchWebsitePromptSiteIcon(siteId, fetchWebsiteIcon);
    }

    onCreated(id);
  }

  const canSave =
    name.trim().length > 0 && text.trim().length > 0 && websiteConfigValid;

  return (
    <div className="flex h-full items-start justify-center overflow-auto px-6 py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prompt name, e.g. Draft a formal email"
            autoFocus
            className={cn(
              "border-border bg-muted/30 text-foreground focus-within:border-ring w-full rounded-lg border px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none",
            )}
          />
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Prompt
          </p>
          <div className="border-border bg-muted/30 focus-within:border-ring rounded-lg border">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe what you want the AI to do with the selected text..."
              rows={6}
              className={cn(
                "text-foreground w-full resize-none bg-transparent px-3 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none",
              )}
            />
            <div className="border-border border-t px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Required — this is sent to the LLM as the system prompt.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Notes
          </p>
          <div className="border-border bg-muted/30 focus-within:border-ring rounded-lg border">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for yourself..."
              rows={3}
              className={cn(
                "text-foreground w-full resize-none bg-transparent px-3 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none",
              )}
            />
            <div className="border-border flex items-center gap-1.5 border-t px-3 py-2">
              <Lock className="text-muted-foreground/60 h-3 w-3" />
              <p className="text-muted-foreground text-xs">
                Private — never sent to the LLM.
              </p>
            </div>
          </div>
        </div>

        <PromptAppSelector
          assignedAppIds={selectedAppIds}
          onChange={setSelectedAppIds}
        />

        <div className="border-border bg-muted/10 space-y-4 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-foreground text-sm font-medium">
                Website prompt
              </p>
              <p className="text-muted-foreground text-xs">
                Optionally connect this prompt to a website or page when you
                save it.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={websiteEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setWebsiteEnabled(enabled);
                  if (
                    enabled &&
                    !websiteDomain.trim() &&
                    !name.trim() &&
                    prefill?.website?.domain
                  ) {
                    setName(
                      suggestPromptNameFromDomain(prefill.website.domain),
                    );
                  }
                }}
                className="accent-foreground h-4 w-4"
              />
              Connect website
            </label>
          </div>

          {websiteEnabled ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium">
                  When you trigger Raypaste while on the connected website or
                  page, this prompt will be used.
                </p>
                <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Domain
                </label>
                <input
                  type="text"
                  value={websiteDomain}
                  onChange={(event) => {
                    const nextDomain = event.target.value;
                    setWebsiteDomain(nextDomain);
                    if (!name.trim()) {
                      setName(suggestPromptNameFromDomain(nextDomain));
                    }
                  }}
                  placeholder="example.com"
                  className={cn(
                    "border-border bg-muted/30 text-foreground focus-within:border-ring w-full rounded-lg border px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground focus:outline-none",
                  )}
                />
                {websiteDomain.trim() && !normalizedWebsiteDomain ? (
                  <p className="text-xs text-amber-600">
                    Enter a valid domain like <code>example.com</code>.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Applies to
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={websiteRuleKind === "site" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setWebsiteRuleKind("site")}
                  >
                    Entire website
                  </Button>
                  <Button
                    type="button"
                    variant={
                      websiteRuleKind === "path-prefix" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setWebsiteRuleKind("path-prefix")}
                  >
                    Specific subpath
                  </Button>
                </div>
              </div>

              {websiteRuleKind === "path-prefix" ? (
                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Subpath URL
                  </label>
                  <input
                    type="text"
                    value={websitePathPrefix}
                    onChange={(event) =>
                      setWebsitePathPrefix(event.target.value)
                    }
                    placeholder={`https://${normalizedWebsiteDomain || "github.com"}/settings`}
                    className={cn(
                      "border-border bg-muted/30 text-foreground focus-within:border-ring w-full rounded-lg border px-3 py-2 text-sm",
                      "placeholder:text-muted-foreground focus:outline-none",
                    )}
                  />
                  {websitePathPrefix.trim() && !normalizedWebsitePathPrefix ? (
                    <p className="text-xs text-amber-600">
                      Enter a full URL on this domain, like{" "}
                      <code>
                        https://{normalizedWebsiteDomain || "github.com"}
                        /settings
                      </code>
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button onClick={handleSave} disabled={!canSave}>
          Save Prompt
        </Button>
      </div>
    </div>
  );
}
