import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { eq, desc, like, or } from "drizzle-orm";
import { completions, usageStats } from "./schema";

export type CompletionEntry = typeof completions.$inferSelect;

export type UsageStatsRow = Omit<
  typeof usageStats.$inferSelect,
  "promptStats" | "appStats"
> & {
  promptStats: Record<string, { uses: number; applied: number }>;
  appStats: Record<string, { uses: number; applied: number }>;
};

const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

async function runMigrations(sqlite: Database): Promise<void> {
  const result = await sqlite.select<{ user_version: number }[]>(
    "PRAGMA user_version",
    [],
  );
  const currentVersion = result[0]?.user_version ?? 0;

  const migrations = Object.entries(migrationFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (let i = currentVersion; i < migrations.length; i++) {
    const [, sql] = migrations[i];
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await sqlite.execute(stmt, []);
    }
    await sqlite.execute(`PRAGMA user_version = ${i + 1}`, []);
  }

  // Ensure the global stats row exists (idempotent)
  await sqlite.execute(
    `INSERT OR IGNORE INTO usage_stats (id) VALUES ('global')`,
    [],
  );
}

let dbPromise: Promise<ReturnType<typeof drizzle>> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const sqlite = await Database.load("sqlite:rayvise.db");

      await runMigrations(sqlite);

      return drizzle(async (sql, params, method) => {
        if (method === "run") {
          await sqlite.execute(sql, params as unknown[]);
          return { rows: [] };
        }
        const rows = await sqlite.select<Record<string, unknown>[]>(
          sql,
          params as unknown[],
        );
        return { rows: rows.map(Object.values) };
      });
    })();
  }
  return dbPromise;
}

export async function saveCompletion(entry: CompletionEntry): Promise<void> {
  const db = await getDb();

  await db.insert(completions).values({
    id: entry.id,
    timestamp: entry.timestamp,
    inputText: entry.inputText,
    outputText: entry.outputText,
    finalText: entry.finalText,
    wasApplied: entry.wasApplied,
    isReviewMode: entry.isReviewMode,
    hadError: entry.hadError,
    errorMessage: entry.errorMessage,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    completionMs: entry.completionMs,
    appId: entry.appId,
    promptId: entry.promptId,
    promptName: entry.promptName,
    promptText: entry.promptText,
    promptSource: entry.promptSource,
    pageUrl: entry.pageUrl,
    matchedWebsitePattern: entry.matchedWebsitePattern,
    model: entry.model,
    provider: entry.provider,
  });

  // Update aggregate stats
  const statsRows = await db
    .select()
    .from(usageStats)
    .where(eq(usageStats.id, "global"));
  const stats = statsRows[0];
  if (!stats) {
    return;
  }

  const promptStatsMap = JSON.parse(stats.promptStats) as Record<
    string,
    { uses: number; applied: number }
  >;
  const appStatsMap = JSON.parse(stats.appStats) as Record<
    string,
    { uses: number; applied: number }
  >;

  promptStatsMap[entry.promptId] = {
    uses: (promptStatsMap[entry.promptId]?.uses ?? 0) + 1,
    applied:
      (promptStatsMap[entry.promptId]?.applied ?? 0) +
      (entry.wasApplied ? 1 : 0),
  };
  appStatsMap[entry.appId] = {
    uses: (appStatsMap[entry.appId]?.uses ?? 0) + 1,
    applied:
      (appStatsMap[entry.appId]?.applied ?? 0) + (entry.wasApplied ? 1 : 0),
  };

  await db
    .update(usageStats)
    .set({
      totalCompletions: stats.totalCompletions + 1,
      totalApplied: stats.totalApplied + (entry.wasApplied ? 1 : 0),
      totalInputTokens: stats.totalInputTokens + (entry.inputTokens ?? 0),
      totalOutputTokens: stats.totalOutputTokens + (entry.outputTokens ?? 0),
      totalCompletionMs: stats.totalCompletionMs + entry.completionMs,
      promptStats: JSON.stringify(promptStatsMap),
      appStats: JSON.stringify(appStatsMap),
    })
    .where(eq(usageStats.id, "global"));
}

export async function updateCompletionOutcome(
  id: string,
  finalText: string | null,
  wasApplied: boolean,
): Promise<void> {
  const db = await getDb();
  await db
    .update(completions)
    .set({ finalText, wasApplied: wasApplied ? 1 : 0 })
    .where(eq(completions.id, id));

  if (wasApplied) {
    const statsRows = await db
      .select()
      .from(usageStats)
      .where(eq(usageStats.id, "global"));
    const stats = statsRows[0];
    if (!stats) {
      return;
    }
    await db
      .update(usageStats)
      .set({ totalApplied: stats.totalApplied + 1 })
      .where(eq(usageStats.id, "global"));
  }
}

export async function listCompletions(
  limit: number,
  offset: number,
  search?: string,
): Promise<CompletionEntry[]> {
  const db = await getDb();
  if (search) {
    const pattern = `%${search}%`;
    const rows = await db
      .select()
      .from(completions)
      .where(
        or(
          like(completions.inputText, pattern),
          like(completions.promptName, pattern),
          like(completions.appId, pattern),
          like(completions.pageUrl, pattern),
          like(completions.matchedWebsitePattern, pattern),
        ),
      )
      .orderBy(desc(completions.timestamp))
      .limit(limit)
      .offset(offset);
    return rows as CompletionEntry[];
  }
  const rows = await db
    .select()
    .from(completions)
    .orderBy(desc(completions.timestamp))
    .limit(limit)
    .offset(offset);
  return rows as CompletionEntry[];
}

export async function listDistinctPrompts(): Promise<
  { promptId: string; promptName: string }[]
> {
  const db = await getDb();
  const rows = await db
    .select({
      promptId: completions.promptId,
      promptName: completions.promptName,
    })
    .from(completions)
    .groupBy(completions.promptId);
  return rows;
}

export async function getUsageStats(): Promise<UsageStatsRow> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(usageStats)
    .where(eq(usageStats.id, "global"));
  const row = rows[0];
  if (!row) {
    return {
      id: "global",
      totalCompletions: 0,
      totalApplied: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCompletionMs: 0,
      promptStats: {},
      appStats: {},
    };
  }
  return {
    ...row,
    promptStats: JSON.parse(row.promptStats) as Record<
      string,
      { uses: number; applied: number }
    >,
    appStats: JSON.parse(row.appStats) as Record<
      string,
      { uses: number; applied: number }
    >,
  };
}

export async function deleteCompletion(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(completions).where(eq(completions.id, id));
}

export async function clearAllCompletions(): Promise<void> {
  const db = await getDb();
  await db.delete(completions);
}

export async function resetAllHistory(): Promise<void> {
  const db = await getDb();
  await db.delete(completions);
  await db
    .update(usageStats)
    .set({
      totalCompletions: 0,
      totalApplied: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCompletionMs: 0,
      promptStats: "{}",
      appStats: "{}",
    })
    .where(eq(usageStats.id, "global"));
}
