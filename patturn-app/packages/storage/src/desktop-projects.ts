import { isDesktop } from './native-files.js';
/** Explicit desktop-only load: do not mix SQL failure with browser project storage. */
export async function desktopProjectRepo() {
  if (!isDesktop()) throw Error('SQLITE_PROJECT_REQUIRE_TAURI');
  const [{ SqliteProjectRepo }, { default: Database }] = await Promise.all([
    import('./sqlite-projects.js'),
    import('@tauri-apps/plugin-sql'),
  ]);
  const database = await Database.load('sqlite:patturn.db');
  return new SqliteProjectRepo({
    execute: async (query, parameters) => {
      await database.execute(query, parameters);
    },
    select: (query, parameters) => database.select<Record<string, unknown>[]>(query, parameters),
  });
}
