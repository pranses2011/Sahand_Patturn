import { isDesktop } from './native-files.js';
/** Explicit factory; never silently falls back to browser storage after a database failure. */
export async function desktopSqliteHistory(patterns: readonly string[]) {
  if (!isDesktop()) throw Error('SQLITE_HISTORY_REQUIRE_TAURI');
  const { SqliteEditorHistory } = await import('./sqlite-history.js');
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const database = await Database.load('sqlite:patturn.db');
  return new SqliteEditorHistory(
    {
      execute: async (query, parameters) => {
        await database.execute(query, parameters);
      },
      select: (query, parameters) => database.select<Record<string, unknown>[]>(query, parameters),
    },
    patterns,
  );
}
