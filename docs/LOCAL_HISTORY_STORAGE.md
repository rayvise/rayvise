# Local History Storage

Rayvise stores all completion history locally in a SQLite database on your device. Your prompts, inputs, outputs, and performance metrics never leave your machine.

The database is managed by Tauri's `tauri-plugin-sql` (IPC bridge to SQLite). Schema is defined in `src/services/db/schema.ts` using Drizzle ORM, and migrations are applied automatically at app startup.

**Database location (macOS):**

```
~/Library/Application Support/com.rayvise.rayvise/rayvise.db
```

---

## Schema

The database consists of two tables: `completions` (individual records) and `usage_stats` (aggregates). View schema definition at `src/services/db/schema.ts`.

---

## Migrations

Schema changes are managed with **drizzle-kit** and applied automatically at startup via `PRAGMA user_version`.

### How it works

1. Migration `.sql` files live in `src/services/db/migrations/` and are committed to the repo.
2. Vite bundles them as raw strings via `import.meta.glob`.
3. On startup, `runMigrations()` in `src/services/db/index.ts`:
   - Reads `PRAGMA user_version` to determine how many migrations have been applied.
   - Runs each pending migration in filename order, splitting on `-->statement-breakpoint`.
   - Increments `PRAGMA user_version` after each successful migration.
4. After migrations finish, the app ensures the singleton `usage_stats` row exists by inserting the `global` row if needed.

Because the Tauri SQLite driver operates over an IPC bridge, drizzle-kit is used **only** to generate SQL — it never connects to the runtime database directly.

### Making a schema change

```bash
# 1. Edit the schema
open src/services/db/schema.ts

# 2. Generate a new migration
pnpm db:generate
# → writes src/services/db/migrations/XXXX_<name>.sql

# 3. Launch the app to apply pending migrations
pnpm tauri dev

# 4. Commit both files
git add src/services/db/schema.ts src/services/db/migrations/
```

Migrations are **not** applied by `drizzle-kit`. They are executed automatically the next time Rayvise starts and initializes the database.

### Running migrations locally

To apply pending migrations during development:

```bash
pnpm tauri dev
```

On startup, the app opens `rayvise.db`, runs `runMigrations()`, applies any new SQL files, updates `PRAGMA user_version`, and ensures the `usage_stats` `global` row exists.

To verify a migration from a clean slate:

```bash
rm ~/Library/Application\ Support/com.rayvise.rayvise/rayvise.db
pnpm tauri dev
```

This recreates the database from migration 0 and reapplies the full migration set.

### Resetting the database (development)

To wipe the DB and start fresh from migration 0:

```bash
rm ~/Library/Application\ Support/com.rayvise.rayvise/rayvise.db
```

On next app launch, all migrations will re-run against the empty file.

---

## Frontend Integration

### Data access (`src/services/db/index.ts`)

- `saveCompletion(entry)` — Persists a new completion and updates aggregate stats
- `updateCompletionOutcome(id, finalText, wasApplied)` — Records the user's accept/reject action in review mode
- `listCompletions(limit, offset, search?)` — Paginated history, newest first; optional full-text search across input, prompt name, and app ID
- `listDistinctPrompts()` — Returns `{ promptId, promptName }` pairs for all prompts that have completions
- `getUsageStats()` — Returns the single `usage_stats` row with parsed JSON fields
- `deleteCompletion(id)` — Removes a single entry (does not update aggregate stats)
- `clearAllCompletions()` — Empties the `completions` table (stats are preserved)
- `resetAllHistory()` — Drops all completions **and** resets all stats to zero

### History page (`src/pages/HistoryPage.tsx`)

- **Left panel** — searchable completion list (up to 200 entries). Each card shows app, prompt name, input preview, status icon (applied / dismissed / error), and relative time. Click to open a detail dialog; hover to reveal a per-entry delete button.
- **Right panel** — overview stats (total completions, avg tokens/sec, avg completion time, most-used prompt) and per-prompt usage counts. Bottom actions: _Clear history_ (deletes log entries, preserves stats) and _Reset all data_ (deletes everything).
- Auto-refreshes on `rayvise://completion-saved` events.

---

## Privacy & Retention

- **Local only** — data never leaves the device; no network calls are made by the DB layer.
- **Full control** — delete individual entries or the entire history at any time from the History page.
- **Immutable snapshots** — `prompt_text` and `prompt_name` are stored as-is at time of use, so you can always see exactly what instructions produced a given result even if the prompt is later edited.
