# Website prompts

## What it is

**Website prompts** map saved prompts to websites: you define a **domain** (e.g. `github.com`) and one or more **rules** that pick which prompt runs when you use the hotkey (**Cmd+Ctrl+R**) on a matching page. Configuration lives under **Website prompts** in the sidebar (`src/pages/website-prompts/WebsitePromptsPage.tsx`). State is persisted in Zustand as `websitePromptSites` in `src/stores/promptsStore.ts`.

## When matching runs

Matching uses the **current tab URL** (`page_url`) from the Rust hotkey pipeline. The backend resolves it off the main thread via `commands::browser_url::try_get_active_tab_url` (AppleScript for Chrome, Safari, Arc, Brave, Edge, Opera, etc.). **Firefox** does not expose a reliable active-tab URL that way, so `page_url` is often missing there.

- If `page_url` is present and parses as a URL, Rayvise tries **website prompt** matching first.
- If `page_url` is missing or no site matches, resolution falls back to **per-app prompt → default prompt → built-in “Formal” → first prompt** (see below).

When you have at least one website configured but the hotkey fires in a **known browser** with **no** `page_url`, the app shows a short **info toast once per browser bundle ID** explaining that the fallback chain was used (`src/hooks/useAICompletionListener.ts`).

## Data model

Each **site** has:

- **`domain`** — hostname only (normalized, no scheme). Subdomains of that host are included (e.g. domain `example.com` matches `www.example.com` and `docs.example.com`).
- **`rules`** — ordered conceptually as two kinds (see next section).
- **Icon** — optional favicon for the list UI; fetching is implemented in Rust (`src-tauri/src/commands/website_icons.rs`, `fetch_website_icon`) and triggered from the frontend via `src/services/websiteIcons.ts` + `fetchWebsitePromptSiteIcon` in the store.

### `Prompt.websitePromptSiteIds` (denormalized)

Each **prompt** also stores **`websitePromptSiteIds`**: the ids of `WebsitePromptSite` rows that have **at least one rule** with `promptId` equal to that prompt’s `id`.

- **Source of truth** for what runs on a page is still **`websitePromptSites` and rules** (`pickWebsitePromptMatch`, hotkey resolution). The array on `Prompt` is a **cached projection** for UI (e.g. sidebar “Unassigned” = no app assignment and empty `websitePromptSiteIds`) and must **not** be edited as the primary place to configure website mappings.
- **Keeping it correct:** `recomputePromptWebsiteSiteIds` in `src/stores/promptsStore.ts` rebuilds the arrays from `websitePromptSites`. It runs on **`persist` merge** (loads old localStorage) and after **every store action** that changes rules or removes sites. If you add new code paths that mutate `websitePromptSites`, **call recompute** (or mirror the pattern used in existing actions) or the sidebar and any other consumer of `websitePromptSiteIds` will drift.
- **Navigation:** Prompts that only appear under website rules may not show under the main Prompts sidebar; use **Edit prompt** next to a rule (see `WebsitePromptSiteEditor.tsx`) to open the full prompt editor.

## Rule kinds

**`path-prefix`** — Applies when the **full tab URL** (string) **starts with** the rule’s stored value. Values are normalized to a full `https://…` URL on the site’s domain (no trailing slash on the path). Use this for specific sections (e.g. only `/docs/…`).

**`site`** — Applies to the **whole domain tree** for that site when no `path-prefix` rule matches the current URL.

Rules without a non-empty `promptId` are ignored for matching.

## How a page picks a prompt (`pickWebsitePromptMatch`)

1. Parse `page_url` and take the page hostname (lowercase, strip trailing dots).
2. Keep sites whose **domain** matches the host: exact match or the host is a **subdomain** of the configured domain (`mail.google.com` matches site domain `google.com`).
3. Among those sites, prefer the **longest domain** string (more specific registration wins when several could match).
4. For each site in that order:
   - Consider **`path-prefix`** rules first. Among them, the **longest prefix** wins (`sortWebsitePromptRules` in `promptsStore.ts`).
   - If a prefix matches (`pageUrl.startsWith(rule.value)`), use that rule’s prompt.
   - Else, if there is a **`site`** rule with a prompt, use it (matched pattern recorded as the site domain).
5. If no site yields a rule, website matching fails and the global fallback runs.

## Full resolution order (`resolvePromptForHotkey`)

1. **Website** — if `page_url` is non-empty and `pickWebsitePromptMatch` returns a prompt id that still exists in your prompts list.
2. **App** — prompt assigned to the focused app’s bundle ID.
3. **Default** — prompt set as default (`defaultPromptId`), if any.
4. **Built-in** — prompt with id `formal`, if present.
5. **Built-in** — first prompt in the list.

The result includes `source` (`website` | `app` | `default` | `builtin`) and optional `matchedWebsitePattern` for logging/UI.
