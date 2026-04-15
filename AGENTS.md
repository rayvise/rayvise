# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
pnpm tauri dev        # Development (Vite + Tauri desktop window)
pnpm tauri build      # Production build
pnpm lint / lint:fix  # ESLint
pnpm format           # Prettier (sorts Tailwind classes)
pnpm format:rust      # cargo fmt
pnpm check            # lint + format together
pnpm test             # Vitest single run
pnpm test:watch       # Vitest watch mode
pnpm db:generate      # Generate migration after editing src/services/db/schema.ts
```

Run a single test file: `pnpm test src/path/to/file.test.tsx`

## Architecture

**Tauri 2.0** desktop app — Rust backend (`src-tauri/src/`) + React 19/TypeScript frontend (`src/`).

### Hotkey pipeline

Main Rayvise hotkey, (default: **Cmd+Ctrl+R**) triggers:

1. **Rust** (`lib.rs`): intercepts via `tauri_plugin_global_shortcut`, captures focused app + selected text on main thread, resolves browser URL off-thread via AppleScript (`commands/browser_url.rs`). Emits `rayvise://hotkey-triggered` with `{ app, selected_text, target_pid, page_url? }`.
2. **Frontend** (`src/hooks/useAICompletionListener.ts`): `resolveHotkeyPrompt` in `promptsStore`; if multiple website or app candidates apply, opens the prompt-picker overlay; otherwise creates `AbortController` and branches to review or instant mode.
3. **Persistence**: saves to SQLite, emits `rayvise://completion-saved` to refresh `HistoryPage`.

**Prompt resolution order** (in `resolveHotkeyPrompt`):

1. Website candidates (if `page_url` present) — longest domain wins for which site applies; within that site, longest matching path-prefix tier, else all site-wide rules; **multiple prompts at the winning specificity tier** → picker
2. Per-app prompts (`getPromptsForApp`) — more than one → picker; one → use it
3. Default prompt (`defaultPromptId`)
4. Built-in `formal` prompt
5. First prompt in list

If website prompts exist but no `page_url` is available (Firefox unsupported; AppleScript failure), a one-time info toast per browser bundle ID fires.

### Multi-window / overlay system

`src/main.tsx` → `<RenderWindow />` routes on `?overlay` query param. All overlays share the same React bundle — each is a separate `WebviewWindow`:

| `?overlay=`   | Component              | Purpose                                                            |
| ------------- | ---------------------- | ------------------------------------------------------------------ |
| _(none)_      | `<App />`              | Main window                                                        |
| `review`      | `<ReviewPage />`       | Streaming text editor (accept/reject)                              |
| `progress`    | `<ProgressPage />`     | Instant mode spinner                                               |
| `toast`       | `<NotificationPage />` | Hotkey / LLM feedback (`notification-*`, bottom-right; not Sonner) |
| `prompt-pick` | `<PromptPickPage />`   | Multi-prompt chooser after hotkey                                  |

**Cross-window IPC:** Overlays share localStorage (same origin). For review mode, initial state + streaming chunks are written to `localStorage[REVIEW_STORAGE_KEY]` — this avoids focus-flashing race conditions with Tauri event delivery timing. The prompt picker uses `localStorage[PROMPT_PICK_STORAGE_KEY]`; the main window listens for `rayvise://prompt-picked` / `rayvise://prompt-pick-cancel`. Hotkey-related messages use `showToastOverlay()` in `overlayWindows.ts`, which opens a dedicated `notification-*` window (bottom-right, `focus: false`) so they are visible over other apps; use Sonner `toast` from `#/hooks/useToast` only for in-app UI. Instant mode skips this; main window closes `progressWin.close()` directly.

Capability files in `src-tauri/capabilities/` control what each window type can do (emit events, drag, close).

### State management

Zustand + `persist` (localStorage), all re-exported from `src/stores/index.ts`:

- **`settingsStore`** — LLM mode/provider/keys, `reviewMode`, `themeMode`
- **`promptsStore`** — prompts CRUD, app assignments, website prompt rules
- **`appsStore`** — macOS installed apps (not persisted; loaded fresh on each Layout mount)

**Critical invariants in `promptsStore`:**

- **App assignment is many-to-many**: `assignAppToPrompt` only adds the bundle id to that prompt’s `appIds` (deduped). Use `removeAppFromPrompt(promptId, appId)` to drop one link from the prompt editor; use `unassignApp(appId)` to remove that app from **all** prompts (e.g. Apps page “Clear all”).
- **`websitePromptSiteIds[]` is denormalized** on each `Prompt` (derived from `websitePromptSites` rules). Call `recomputePromptWebsiteSiteIds()` after every mutation that touches sites or rules — including in `persist` merge. Failing to do so breaks the sidebar "Unassigned" count and related UI.

### LLM service layer

`src/services/llm/index.ts` — `getLLMClient()` factory (reads `settingsStore` at call time):

- `VITE_DRY_RUN=true` → `dryRunClient` (highest priority; used by Vitest via `vitest.config.ts`)
- `mode: "api"` → `rayviseApiClient` (throws — not yet implemented)
- `mode: "direct"` → `cerebrasClient` or `openrouterClient`

All clients implement `.stream(req, apiKey, onChunk, signal)` with `AbortSignal` support.

### Database

Schema: `src/services/db/schema.ts`. Migrations: `src/services/db/migrations/*.sql`.

**Schema changes:** edit schema → `pnpm db:generate` → commit the generated `.sql`. Migrations apply automatically at startup via `PRAGMA user_version`. Never manually edit generated migration files.

### Rust backend

New commands go under `src-tauri/src/commands/` and are registered in `lib.rs`. Keep command handlers thin — parse inputs, delegate to helpers, return `Result<T, String>`.

**AppKit/AX APIs must run on the main thread** — use `run_on_main_thread`. Do not call UI or Accessibility APIs from spawned threads.

Return `Result<T, String>` (or serializable error) from `#[tauri::command]`; propagate errors with `?`. Avoid `unwrap()`/`expect()` on user-facing paths.

Run `cargo clippy` before large Rust changes; fix new warnings when reasonable.

### Frontend conventions

- Path alias: `#` → `./src`
- Navigation: pure React state in `Layout.tsx` — no router library
- UI primitives: `src/components/ui/` (Radix UI wrappers)
- Tailwind CSS v4; dark-themed by default

### Testing

`vitest.config.ts` sets `VITE_DRY_RUN=true` so LLM paths work without real API calls.

**Mocking pattern** — use hoisted `Map` for Tauri event listeners:

```typescript
const listeners = vi.hoisted(() => new Map<string, Handler>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event, handler) => {
    listeners.set(event, handler);
    return Promise.resolve(() => {});
  },
  emit: vi.fn(),
}));
// In test: listeners.get("rayvise://hotkey-triggered")!({ payload: {...} });
```

Mock helpers: `src/test/mocks/tauri.ts`. DB is mocked via `vi.mock("#/services/db")`. See `docs/TESTING_STRATEGY.md` for coverage priorities.
