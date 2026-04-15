---
name: rayvise-vitest-tests
description: Adds and extends Vitest unit tests for the Rayvise Tauri (React/TypeScript) frontend with jsdom, Testing Library, and Tauri mocks. Use when writing or refactoring tests, improving coverage, or when the user mentions Vitest, Testing Library, frontend tests, mocks, or test setup in this repository.
---

# Rayvise frontend tests (Vitest)

## Commands

```bash
pnpm test           # single run (CI)
pnpm test:watch     # local iteration
pnpm test:coverage  # v8 coverage
```

## Placement and naming

- Colocate tests as `*.test.ts` or `*.test.tsx` next to the code under test (`src/**/*.test.{ts,tsx}` per `vitest.config.ts`).
- Import the `#` path alias the same way production code does (`#/stores`, `#/services/...`).

## Stack (do not swap tools)

| Concern | Tool |
| -------- | ------ |
| Runner | Vitest |
| DOM | jsdom |
| Components / hooks | `@testing-library/react`, `@testing-library/user-event` |
| Matchers | `@testing-library/jest-dom` (loaded in `src/test/setup.ts`) |
| Tauri | `vi.mock` on `@tauri-apps/api/*`; helpers in `src/test/mocks/tauri.ts` |

`import.meta.env.VITE_DRY_RUN` is `"true"` in Vitest (`vitest.config.ts` `define`). Each test file should import from `vitest` explicitly (`globals: false`).

Global setup runs `cleanup()` from Testing Library and `localStorage.clear()` after each test (`src/test/setup.ts`).

## What to mock (unit tests)

- **`@tauri-apps/api/core`** (`invoke`) — no Rust backend.
- **`@tauri-apps/api/event`** (`listen`, `emit`) — use a hoisted `Map` of event name → handler when tests need to fire payloads (see `useAICompletionListener.test.tsx`, `HistoryPage.test.tsx`).
- **`@tauri-apps/api/webviewWindow`** — when exercising overlay window construction.
- **`#/services/db`** — mock exports and assert call contracts; real SQLite is not available in Node without further refactoring or Tauri/e2e.
- **`#/lib/core/reviewMode` / `instantMode`** — mock when testing the hotkey listener in isolation for speed and determinism.

Shared factories: `createMockInvoke`, `createMockEmit`, `createMockListen`, `createMockWebviewWindow` in `src/test/mocks/tauri.ts`.

## Patterns that work here

1. **`vi.hoisted`** — when mocks and tests both need stable references to the same `vi.fn()` or listener registry (see existing tests).
2. **Zustand stores in tests** — `useXStore.setState(...)` in `beforeEach` with minimal shape; `vi.spyOn(useXStore.persist, "rehydrate")` when persist would otherwise run.
3. **Pure helpers** — test directly with `describe` / `it`; no Tauri mocks unless they import IPC.

## Coverage priorities (by product risk)

Align new tests with these when choosing what to cover first:

1. **`promptsStore`** — website matching, fallback resolution, exclusive app assignment, deletes + rule cleanup + `websitePromptSiteIds`.
2. **Completion pipeline** — `runReviewMode` / `runInstantMode` ordering and `saveCompletion`-related payloads.
3. **`useAICompletionListener`** — selection empty, API key, browser without URL + info toast behavior.
4. **History UI** — reactions to `rayvise://completion-saved` and DB-shaped mocks.
5. **Pure helpers** — small focused tests.

## CI and scope

- GitHub Actions runs `pnpm test` on Linux without the native Tauri stack; tests must stay headless-friendly.
- Deeper DB integration belongs in a future injectable-backend or Tauri/e2e path, not ad hoc SQLite in Vitest unless the architecture supports it.

## Rust (`src-tauri`)

Optional `#[cfg(test)]` for **pure** helpers extracted from IPC is fine; this skill targets the **frontend** Vitest suite unless the user asks for Rust tests.

## Full reference

For history/usage-stat contracts, future work, and rationale, read [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md).
