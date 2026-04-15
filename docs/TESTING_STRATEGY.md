# Testing strategy

This document describes how automated tests are organized in Rayvise and what they protect. It complements the implementation plan (Vitest, jsdom, React Testing Library).

## Running tests

```bash
pnpm test          # single run (CI)
pnpm test:watch    # watch mode during development
pnpm test:coverage # coverage report (v8)
```

## Stack

| Layer       | Tooling                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| Runner      | Vitest (`vitest.config.ts`)                                                    |
| DOM         | jsdom                                                                          |
| UI / hooks  | `@testing-library/react`, `@testing-library/user-event`                        |
| Assertions  | `@testing-library/jest-dom` (via `src/test/setup.ts`)                          |
| Tauri / IPC | `vi.mock` on `@tauri-apps/api/*` and thin helpers in `src/test/mocks/tauri.ts` |

The Vite `#` path alias matches `vite.config.ts` / `vitest.config.ts`.

## What to mock

- **`@tauri-apps/api/core`** (`invoke`) — no Rust backend in unit tests.
- **`@tauri-apps/api/event`** (`listen`, `emit`) — drive handlers from tests with a small listener map (`useAICompletionListener.test.tsx`).
- **`@tauri-apps/api/webviewWindow`** — when testing overlay helpers that construct windows.
- **`#/services/db`** — SQLite runs inside Tauri; default is to mock DB exports and assert call contracts (`HistoryPage.test.tsx`). Deeper SQL integration tests are optional and may require refactoring `getDb()` or running against a real DB in a Tauri/e2e context.
- **`#/lib/core/reviewMode` / `instantMode`** — when testing the hotkey hook in isolation, these are mocked so the listener test stays fast and deterministic.

`import.meta.env.VITE_DRY_RUN` is defined in Vitest config so LLM code paths can stay dry-run friendly when not fully mocked.

## Coverage priorities (by risk)

1. **Prompt store** (`src/stores/promptsStore.ts`) — website matching, fallback resolution, exclusive app assignment, `deletePrompt` + rule cleanup + `websitePromptSiteIds` recompute. Covered in `promptsStore.test.ts`.
2. **Completion pipeline** — `runReviewMode` / `runInstantMode` event order and `saveCompletion` payloads (`reviewMode.test.ts`, `instantMode.test.ts`).
3. **Hotkey listener** — empty selection, API key, browser + missing URL info toast (`useAICompletionListener.test.tsx`).
4. **History UI** — refetch on `rayvise://completion-saved` (`HistoryPage.test.ts`).
5. **Pure helpers** — overview math (`helpers.test.ts`).

## History and usage stats (documented behavior)

The SQLite layer (`src/services/db/index.ts`) is not fully exercised in Node without mocks. Intended behavior (see also `docs/LOCAL_HISTORY_STORAGE.md`):

| Action                    | Completions table                 | `usage_stats` aggregates                                                                                                |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `saveCompletion`          | Insert row                        | Increments totals and per-prompt / per-app JSON maps                                                                    |
| `updateCompletionOutcome` | Updates `finalText`, `wasApplied` | If applied, increments `totalApplied` only (per-prompt `applied` in JSON is not retroactively adjusted in current code) |
| `deleteCompletion`        | Deletes row                       | Unchanged                                                                                                               |
| `clearAllCompletions`     | Empty table                       | Unchanged                                                                                                               |
| `resetAllHistory`         | Empty table                       | All stats zeroed                                                                                                        |

Tests should flag accidental changes to these contracts when the DB module is refactored for injectable backends.

## CI

GitHub Actions runs `pnpm test` after install in a dedicated workflow (see `.github/workflows/test.yml`). Tests are designed to run on Linux without the Tauri native stack.

## Future work

- Optional macOS smoke tests against a built app (hotkey, Accessibility, browser URL).
- Selective Rust `#[cfg(test)]` for pure helpers in `src-tauri` when extracted from IPC handlers.
