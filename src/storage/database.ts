import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("antigpt-mobile.db");
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

  const { user_version: version } = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  ) ?? { user_version: 0 };

  if (version < 1) {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'cancelled', 'failed', 'interrupted')),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_conversation_order
          ON messages(conversation_id, created_at, id);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    });
  }

  await db.runAsync(
    "UPDATE messages SET status = 'interrupted' WHERE status = 'streaming'",
  );
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndMigrate().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}
