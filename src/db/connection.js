import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/**
 * Open (or create) the SQLite database and apply the schema.
 * @param {string} [dbPath]  Path to the .db file. Use ':memory:' for tests.
 */
export function openDatabase(dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'ticketing.db')) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  // Apply schema statement by statement (node:sqlite can choke on
  // multi-statement strings that contain comments).
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  for (const statement of schema.split(';')) {
    const trimmed = statement.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      db.exec(trimmed + ';');
    }
  }
  return db;
}
