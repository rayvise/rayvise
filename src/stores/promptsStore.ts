import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExportedPromptFile, ImportMode } from "#/lib/promptsImportExport";

/**
 * Invariants for website prompt ↔ prompt linkage (see `docs/WEBSITE_PROMPTS.md`):
 *
 * - **Source of truth:** `websitePromptSites[].rules[].promptId` (and site ids on each site).
 * - **Denormalized cache:** `Prompt.websitePromptSiteIds` lists site ids that have at least one
 *   rule with `promptId === this.id`. Do not hand-edit in the UI; it is derived.
 * - **Keep in sync:** Any store code that mutates `websitePromptSites` (rules or removal of sites)
 *   must end with `recomputePromptWebsiteSiteIds` on the prompts array (see existing actions).
 *   `persist` `merge` also recomputes so older localStorage without this field stays correct.
 * - **Hotkey / matching** reads `websitePromptSites` only, not `websitePromptSiteIds`.
 */
export interface Prompt {
  id: string;
  name: string;
  text: string;
  notes: string;
  appIds: string[];
  /**
   * Denormalized cache: `WebsitePromptSite.id` values where some rule has `promptId === id`.
   * Must stay aligned with `websitePromptSites`; see module comment above.
   */
  websitePromptSiteIds: string[];
}

export type PromptSource = "website" | "app" | "default" | "builtin";

export type WebsitePromptSiteIconStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface WebsitePromptSiteRule {
  id: string;
  kind: "site" | "path-prefix";
  value: string;
  promptId: string;
  label: string;
}

export interface WebsitePromptSite {
  id: string;
  domain: string;
  iconSrc: string | null;
  iconStatus: WebsitePromptSiteIconStatus;
  rules: WebsitePromptSiteRule[];
}

export interface PromptResolution {
  prompt: Prompt;
  source: PromptSource;
  pageUrl: string | null;
  matchedWebsitePattern: string | null;
}

export type HotkeyPromptResolution =
  | { kind: "single"; resolution: PromptResolution }
  | { kind: "pick"; candidates: PromptResolution[] };

export interface WebsitePromptCandidate {
  promptId: string;
  matchedWebsitePattern: string;
}

function normalizeDomainInput(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const candidate = /^[a-z]+:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const normalizedURL = url.hostname.replace(/\.+$/, "");

    return normalizedURL;
  } catch {
    return "";
  }
}

function normalizePathPrefixInput(input: string, domain: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const normalizedDomain = normalizeDomainInput(domain);
    if (!normalizedDomain) {
      return "";
    }

    const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    const matchesDomain =
      hostname === normalizedDomain ||
      hostname.endsWith(`.${normalizedDomain}`);
    if (!matchesDomain) {
      return "";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function extractDomainFromPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname.toLowerCase().replace(/\.+$/, "");
    } catch {
      return "";
    }
  }
  return normalizeDomainInput(trimmed);
}

function toStoredRuleValue(
  kind: WebsitePromptSiteRule["kind"],
  value: string,
  domain: string,
): string {
  if (kind === "site") {
    return "";
  }
  return normalizePathPrefixInput(value, domain);
}

function sortWebsitePromptRules(
  rules: WebsitePromptSiteRule[],
): WebsitePromptSiteRule[] {
  return [...rules].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "path-prefix" ? -1 : 1;
    }
    if (a.kind === "path-prefix" && b.kind === "path-prefix") {
      return b.value.length - a.value.length;
    }
    return 0;
  });
}

function normalizeWebsitePromptSite(
  site: WebsitePromptSite,
): WebsitePromptSite | null {
  const domain = normalizeDomainInput(site.domain);
  if (!domain && site.rules.length === 0) {
    return {
      ...site,
      domain: "",
      iconSrc: null,
      iconStatus: site.iconStatus ?? "idle",
      rules: [],
    };
  }

  const rules = sortWebsitePromptRules(
    site.rules.map((rule) => ({
      ...rule,
      label: rule.label ?? "",
      value: toStoredRuleValue(rule.kind, rule.value, domain),
      promptId: rule.promptId.trim(),
    })),
  );

  return {
    ...site,
    domain,
    iconSrc: site.iconSrc ?? null,
    iconStatus: site.iconStatus ?? "idle",
    rules,
  };
}

function domainMatches(pageHost: string, siteDomain: string): boolean {
  return pageHost === siteDomain || pageHost.endsWith(`.${siteDomain}`);
}

/**
 * All website prompt candidates for a URL at the winning site and specificity tier
 * (same precedence as the former single-winner matcher).
 */
export function collectWebsitePromptCandidates(
  sites: WebsitePromptSite[],
  pageUrl: string,
): WebsitePromptCandidate[] {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return [];
  }

  const pageHost = url.hostname.toLowerCase().replace(/\.+$/, "");
  const matchingSites = sites
    .filter((site) => site.domain && domainMatches(pageHost, site.domain))
    .sort((a, b) => b.domain.length - a.domain.length);

  for (const site of matchingSites) {
    const sortedRules = sortWebsitePromptRules(site.rules);
    const matchingPath = sortedRules.filter(
      (rule) =>
        rule.kind === "path-prefix" &&
        rule.promptId &&
        rule.value &&
        pageUrl.startsWith(rule.value),
    );
    if (matchingPath.length > 0) {
      const maxLen = Math.max(...matchingPath.map((r) => r.value.length));
      const atMax = matchingPath.filter((r) => r.value.length === maxLen);
      const out: WebsitePromptCandidate[] = [];
      const seen = new Set<string>();
      for (const rule of atMax) {
        if (!seen.has(rule.promptId)) {
          seen.add(rule.promptId);
          out.push({
            promptId: rule.promptId,
            matchedWebsitePattern: rule.value,
          });
        }
      }
      return out;
    }

    const siteWide = sortedRules.filter(
      (rule) => rule.kind === "site" && rule.promptId,
    );
    if (siteWide.length > 0) {
      const out: WebsitePromptCandidate[] = [];
      const seen = new Set<string>();
      for (const rule of siteWide) {
        if (!seen.has(rule.promptId)) {
          seen.add(rule.promptId);
          out.push({
            promptId: rule.promptId,
            matchedWebsitePattern: site.domain,
          });
        }
      }
      return out;
    }
  }

  return [];
}

function pickWebsitePromptMatch(
  sites: WebsitePromptSite[],
  pageUrl: string,
): { promptId: string; matchedWebsitePattern: string } | null {
  const c = collectWebsitePromptCandidates(sites, pageUrl);
  return c[0] ?? null;
}

/**
 * Rebuilds `websitePromptSiteIds` on every prompt from the current `websitePromptSites` graph.
 *
 * Call this after any change to rules or site list that could alter `rule.promptId` links, and
 * in `persist` `merge` after hydrating from disk. If you add a new action that writes
 * `websitePromptSites` without going through an existing action, add a recompute there too.
 */
export function recomputePromptWebsiteSiteIds(
  prompts: Prompt[],
  websitePromptSites: WebsitePromptSite[],
): Prompt[] {
  return prompts.map((p) => ({
    ...p,
    websitePromptSiteIds: websitePromptSites
      .filter((site) =>
        site.rules.some((r) => r.promptId && r.promptId === p.id),
      )
      .map((s) => s.id),
  }));
}

interface PromptsState {
  prompts: Prompt[];
  defaultPromptId: string | null;
  websitePromptSites: WebsitePromptSite[];
  addPrompt: (prompt: {
    id?: string;
    name: string;
    text: string;
    notes?: string;
  }) => void;
  updatePrompt: (id: string, updates: Partial<Omit<Prompt, "id">>) => void;
  deletePrompt: (id: string) => void;
  assignAppToPrompt: (promptId: string, appId: string) => void;
  removeAppFromPrompt: (promptId: string, appId: string) => void;
  unassignApp: (appId: string) => void;
  getPromptsForApp: (appId: string) => Prompt[];
  getPromptForApp: (appId: string) => Prompt | undefined;
  setDefaultPrompt: (id: string | null) => void;
  addWebsitePromptSite: () => string;
  updateWebsitePromptSite: (
    id: string,
    updates: Partial<
      Pick<WebsitePromptSite, "domain" | "iconSrc" | "iconStatus">
    >,
  ) => void;
  removeWebsitePromptSite: (id: string) => void;
  addWebsitePromptSiteRule: (
    siteId: string,
    rule?: Partial<
      Pick<WebsitePromptSiteRule, "kind" | "value" | "promptId" | "label">
    >,
  ) => string;
  updateWebsitePromptSiteRule: (
    siteId: string,
    ruleId: string,
    updates: Partial<
      Pick<WebsitePromptSiteRule, "kind" | "value" | "promptId" | "label">
    >,
  ) => void;
  removeWebsitePromptSiteRule: (siteId: string, ruleId: string) => void;
  fetchWebsitePromptSiteIcon: (
    siteId: string,
    fetcher?: (domain: string) => Promise<string | null>,
  ) => Promise<void>;
  resolveHotkeyPrompt: (
    appId: string,
    pageUrl: string | null | undefined,
  ) => HotkeyPromptResolution | undefined;
  importPrompts: (
    payload: ExportedPromptFile,
    mode: ImportMode,
  ) => { importedPromptCount: number; importedSiteCount: number };
}

type PersistedPromptsState = Partial<PromptsState> & {
  websitePromptSites?: WebsitePromptSite[];
};

export const usePromptsStore = create<PromptsState>()(
  persist(
    (set, get) => ({
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
      addPrompt: ({ id, name, text, notes = "" }) =>
        set((state) => ({
          prompts: [
            ...state.prompts,
            {
              id: id ?? crypto.randomUUID(),
              name,
              text,
              notes,
              appIds: [],
              websitePromptSiteIds: [],
            },
          ],
        })),
      updatePrompt: (id, updates) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),
      deletePrompt: (id) =>
        set((state) => {
          const websitePromptSites = state.websitePromptSites.map((site) => ({
            ...site,
            rules: site.rules.filter((rule) => rule.promptId !== id),
          }));
          const prompts = recomputePromptWebsiteSiteIds(
            state.prompts.filter((p) => p.id !== id),
            websitePromptSites,
          );
          return {
            prompts,
            defaultPromptId:
              state.defaultPromptId === id ? null : state.defaultPromptId,
            websitePromptSites,
          };
        }),
      assignAppToPrompt: (promptId, appId) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === promptId
              ? {
                  ...p,
                  appIds: [...p.appIds.filter((id) => id !== appId), appId],
                }
              : p,
          ),
        })),
      removeAppFromPrompt: (promptId, appId) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === promptId
              ? { ...p, appIds: p.appIds.filter((id) => id !== appId) }
              : p,
          ),
        })),
      unassignApp: (appId) =>
        set((state) => ({
          prompts: state.prompts.map((p) => ({
            ...p,
            appIds: p.appIds.filter((id) => id !== appId),
          })),
        })),
      getPromptsForApp: (appId) =>
        get().prompts.filter((p) => p.appIds.includes(appId)),
      getPromptForApp: (appId) => get().getPromptsForApp(appId)[0],
      setDefaultPrompt: (id) => set({ defaultPromptId: id }),
      addWebsitePromptSite: () => {
        const id = crypto.randomUUID();
        set((state) => {
          const websitePromptSites: WebsitePromptSite[] = [
            ...state.websitePromptSites,
            {
              id,
              domain: "",
              iconSrc: null,
              iconStatus: "idle" satisfies WebsitePromptSiteIconStatus,
              rules: [],
            },
          ];
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        });
        return id;
      },
      updateWebsitePromptSite: (id, updates) =>
        set((state) => {
          const websitePromptSites = state.websitePromptSites.map((site) => {
            if (site.id !== id) return site;
            const nextDomain =
              updates.domain !== undefined
                ? normalizeDomainInput(updates.domain)
                : site.domain;
            const domainChanged =
              updates.domain !== undefined && nextDomain !== site.domain;
            return {
              ...site,
              ...updates,
              domain: nextDomain,
              iconSrc:
                domainChanged && updates.iconSrc === undefined
                  ? null
                  : (updates.iconSrc ?? site.iconSrc),
              iconStatus:
                updates.iconStatus ??
                (domainChanged ? "idle" : site.iconStatus),
              rules: sortWebsitePromptRules(
                site.rules.map((rule) =>
                  domainChanged
                    ? {
                        ...rule,
                        value: toStoredRuleValue(
                          rule.kind,
                          rule.value,
                          nextDomain,
                        ),
                      }
                    : rule,
                ),
              ),
            };
          });
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        }),
      removeWebsitePromptSite: (id) =>
        set((state) => {
          const websitePromptSites = state.websitePromptSites.filter(
            (site) => site.id !== id,
          );
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        }),
      addWebsitePromptSiteRule: (siteId, rule = {}) => {
        const ruleId = crypto.randomUUID();
        set((state) => {
          const websitePromptSites = state.websitePromptSites.map((site) => {
            if (site.id !== siteId) return site;
            const nextRule: WebsitePromptSiteRule = {
              id: ruleId,
              kind: rule.kind ?? "path-prefix",
              value: toStoredRuleValue(
                rule.kind ?? "path-prefix",
                rule.value ?? "",
                site.domain,
              ),
              promptId: rule.promptId?.trim() ?? "",
              label: rule.label ?? "",
            };
            return {
              ...site,
              rules: sortWebsitePromptRules([...site.rules, nextRule]),
            };
          });
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        });
        return ruleId;
      },
      updateWebsitePromptSiteRule: (siteId, ruleId, updates) =>
        set((state) => {
          const websitePromptSites = state.websitePromptSites.map((site) => {
            if (site.id !== siteId) {
              return site;
            }

            const rules = site.rules.map((rule) => {
              if (rule.id !== ruleId) {
                return rule;
              }

              const nextKind = updates.kind ?? rule.kind;
              return {
                ...rule,
                ...updates,
                kind: nextKind,
                label: updates.label !== undefined ? updates.label : rule.label,
                promptId:
                  updates.promptId !== undefined
                    ? updates.promptId.trim()
                    : rule.promptId,
                value:
                  updates.value !== undefined || updates.kind !== undefined
                    ? toStoredRuleValue(
                        nextKind,
                        updates.value ?? rule.value,
                        site.domain,
                      )
                    : rule.value,
              };
            });

            return { ...site, rules: sortWebsitePromptRules(rules) };
          });
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        }),
      removeWebsitePromptSiteRule: (siteId, ruleId) =>
        set((state) => {
          const websitePromptSites = state.websitePromptSites.map((site) =>
            site.id === siteId
              ? {
                  ...site,
                  rules: site.rules.filter((rule) => rule.id !== ruleId),
                }
              : site,
          );
          return {
            websitePromptSites,
            prompts: recomputePromptWebsiteSiteIds(
              state.prompts,
              websitePromptSites,
            ),
          };
        }),
      fetchWebsitePromptSiteIcon: async (siteId, fetcher) => {
        const site = get().websitePromptSites.find(
          (item) => item.id === siteId,
        );
        if (!site?.domain || !fetcher) {
          return;
        }

        set((state) => ({
          websitePromptSites: state.websitePromptSites.map((item) =>
            item.id === siteId ? { ...item, iconStatus: "loading" } : item,
          ),
        }));

        try {
          const iconSrc = await fetcher(site.domain);
          set((state) => ({
            websitePromptSites: state.websitePromptSites.map((item) =>
              item.id === siteId
                ? {
                    ...item,
                    iconSrc,
                    iconStatus: iconSrc ? "ready" : "error",
                  }
                : item,
            ),
          }));
        } catch {
          set((state) => ({
            websitePromptSites: state.websitePromptSites.map((item) =>
              item.id === siteId
                ? { ...item, iconSrc: null, iconStatus: "error" }
                : item,
            ),
          }));
        }
      },
      resolveHotkeyPrompt: (appId, pageUrl) => {
        const state = get();
        const normalizedPageUrl = pageUrl?.trim() || null;

        const defaultPrompt = state.defaultPromptId
          ? state.prompts.find((p) => p.id === state.defaultPromptId)
          : undefined;
        const builtinPrompt = state.prompts.find((p) => p.id === "formal");
        const firstPrompt = state.prompts[0];

        const withResolution = (
          prompt: Prompt | undefined,
          source: PromptSource,
          matchedWebsitePattern: string | null = null,
        ): PromptResolution | undefined =>
          prompt
            ? {
                prompt,
                source,
                pageUrl: normalizedPageUrl,
                matchedWebsitePattern,
              }
            : undefined;

        if (normalizedPageUrl) {
          const websiteRaw = collectWebsitePromptCandidates(
            state.websitePromptSites,
            normalizedPageUrl,
          );
          const websiteResolutions: PromptResolution[] = [];
          for (const m of websiteRaw) {
            const found = state.prompts.find((p) => p.id === m.promptId);
            if (found) {
              websiteResolutions.push({
                prompt: found,
                source: "website",
                pageUrl: normalizedPageUrl,
                matchedWebsitePattern: m.matchedWebsitePattern,
              });
            }
          }
          if (websiteResolutions.length > 1) {
            return { kind: "pick", candidates: websiteResolutions };
          }
          if (websiteResolutions.length === 1) {
            return {
              kind: "single",
              resolution: websiteResolutions[0],
            };
          }
        }

        const appPrompts = state.getPromptsForApp(appId);
        const appResolutions: PromptResolution[] = appPrompts.map((prompt) => ({
          prompt,
          source: "app" as const,
          pageUrl: normalizedPageUrl,
          matchedWebsitePattern: null,
        }));
        if (appResolutions.length > 1) {
          return { kind: "pick", candidates: appResolutions };
        }
        if (appResolutions.length === 1) {
          return { kind: "single", resolution: appResolutions[0] };
        }

        const fallback =
          withResolution(defaultPrompt, "default") ??
          withResolution(builtinPrompt, "builtin") ??
          withResolution(firstPrompt, "builtin");
        if (!fallback) {
          return undefined;
        }
        return { kind: "single", resolution: fallback };
      },
      importPrompts: (payload, mode) => {
        const state = get();

        if (mode === "replace") {
          const newPrompts = recomputePromptWebsiteSiteIds(
            payload.prompts.map((p) => ({ ...p, websitePromptSiteIds: [] })),
            payload.websitePromptSites.map((s) => ({
              ...s,
              iconSrc: null,
              iconStatus: "idle" as const,
            })),
          );
          const newSites = payload.websitePromptSites.map((s) => ({
            ...s,
            iconSrc: null,
            iconStatus: "idle" as const,
          }));
          set({
            prompts: newPrompts,
            websitePromptSites: newSites,
            defaultPromptId: payload.defaultPromptId,
          });
          return {
            importedPromptCount: payload.prompts.length,
            importedSiteCount: payload.websitePromptSites.length,
          };
        }

        // Merge mode
        const existingPromptIds = new Set(state.prompts.map((p) => p.id));
        const newPrompts = payload.prompts
          .filter((p) => !existingPromptIds.has(p.id))
          .map((p) => ({ ...p, websitePromptSiteIds: [] }));

        const existingSiteIds = new Set(
          state.websitePromptSites.map((s) => s.id),
        );
        const newSites = payload.websitePromptSites
          .filter((s) => !existingSiteIds.has(s.id))
          .map((s) => ({ ...s, iconSrc: null, iconStatus: "idle" as const }));

        const mergedPrompts = recomputePromptWebsiteSiteIds(
          [...state.prompts, ...newPrompts],
          [...state.websitePromptSites, ...newSites],
        );

        set({
          prompts: mergedPrompts,
          websitePromptSites: [...state.websitePromptSites, ...newSites],
        });

        return {
          importedPromptCount: newPrompts.length,
          importedSiteCount: newSites.length,
        };
      },
    }),
    {
      name: "rayvise-prompts",
      // Migration + invariant: recompute denormalized `websitePromptSiteIds` after load so
      // persisted data predating that field, or any drift, cannot break sidebar "Unassigned".
      merge: (persisted, current) => {
        const p = (persisted as PersistedPromptsState | undefined) ?? {};
        const websitePromptSites = (
          p.websitePromptSites?.length ? p.websitePromptSites : []
        )
          .map((site) => normalizeWebsitePromptSite(site) ?? site)
          .filter((site) => site.domain || site.rules.length > 0);

        const mergedPrompts = p.prompts?.length ? p.prompts : current.prompts;
        const prompts = recomputePromptWebsiteSiteIds(
          mergedPrompts.map((pr) => ({
            ...pr,
            appIds: pr.appIds ?? [],
            websitePromptSiteIds: pr.websitePromptSiteIds ?? [],
          })),
          websitePromptSites,
        );

        return {
          ...current,
          ...p,
          websitePromptSites,
          prompts,
        };
      },
    },
  ),
);

export {
  extractDomainFromPattern,
  normalizeDomainInput,
  normalizePathPrefixInput,
  pickWebsitePromptMatch,
};
