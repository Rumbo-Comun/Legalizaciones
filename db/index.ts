import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

let sqlite: DatabaseSync | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getSqlitePath() {
  return process.env.SQLITE_PATH || join(process.env.DATA_DIR || join(process.cwd(), ".data"), "legalizaciones.sqlite");
}

function rowsAsArrays(rows: Record<string, unknown>[]) {
  return rows.map((row) => Object.values(row));
}

function ensureColumn(table: string, column: string, definition: string) {
  const database = getSqlite();
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD ${definition}`);
  }
}

function initializeSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      role text DEFAULT 'revisor' NOT NULL,
      password_hash text NOT NULL,
      password_salt text NOT NULL,
      active integer DEFAULT 1 NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      expires_at text NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id text PRIMARY KEY NOT NULL,
      employee text NOT NULL,
      department text DEFAULT '' NOT NULL,
      fund_code text DEFAULT '' NOT NULL,
      fund_type text DEFAULT 'caja menor' NOT NULL,
      project_name text DEFAULT '' NOT NULL,
      deposit_date text DEFAULT '' NOT NULL,
      deposit_reference text DEFAULT '' NOT NULL,
      deposit_source text DEFAULT '' NOT NULL,
      period_start text DEFAULT '' NOT NULL,
      period_end text DEFAULT '' NOT NULL,
      status text DEFAULT 'borrador' NOT NULL,
      owner_id text REFERENCES users(id) ON DELETE set null,
      currency text DEFAULT 'COP' NOT NULL,
      advance_cents integer DEFAULT 0 NOT NULL,
      cash_returned_cents integer DEFAULT 0 NOT NULL,
      notes text DEFAULT '' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settlement_access (
      id text PRIMARY KEY NOT NULL,
      settlement_id text NOT NULL REFERENCES settlements(id) ON DELETE cascade,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      permission text DEFAULT 'revisar' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_comments (
      id text PRIMARY KEY NOT NULL,
      settlement_id text NOT NULL REFERENCES settlements(id) ON DELETE cascade,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      comment text NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id text PRIMARY KEY NOT NULL,
      settlement_id text NOT NULL REFERENCES settlements(id) ON DELETE cascade,
      date text DEFAULT '' NOT NULL,
      category text DEFAULT '' NOT NULL,
      vendor text DEFAULT '' NOT NULL,
      invoice text DEFAULT '' NOT NULL,
      description text DEFAULT '' NOT NULL,
      amount_cents integer DEFAULT 0 NOT NULL,
      tax_cents integer DEFAULT 0 NOT NULL,
      payment_method text DEFAULT 'efectivo' NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidences (
      id text PRIMARY KEY NOT NULL,
      settlement_id text NOT NULL REFERENCES settlements(id) ON DELETE cascade,
      expense_id text REFERENCES expenses(id) ON DELETE set null,
      file_name text NOT NULL,
      content_type text DEFAULT 'application/octet-stream' NOT NULL,
      size integer DEFAULT 0 NOT NULL,
      r2_key text NOT NULL,
      uploaded_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  ensureColumn("settlements", "fund_type", "`fund_type` text DEFAULT 'caja menor' NOT NULL");
  ensureColumn("settlements", "project_name", "`project_name` text DEFAULT '' NOT NULL");
  ensureColumn("settlements", "deposit_date", "`deposit_date` text DEFAULT '' NOT NULL");
  ensureColumn("settlements", "deposit_reference", "`deposit_reference` text DEFAULT '' NOT NULL");
  ensureColumn("settlements", "deposit_source", "`deposit_source` text DEFAULT '' NOT NULL");
  ensureColumn("settlements", "owner_id", "`owner_id` text REFERENCES users(id) ON DELETE set null");
  ensureColumn("settlements", "currency", "`currency` text DEFAULT 'COP' NOT NULL");
}

function getSqlite() {
  if (sqlite) return sqlite;
  const sqlitePath = getSqlitePath();
  mkdirSync(dirname(sqlitePath), { recursive: true });
  sqlite = new DatabaseSync(sqlitePath);
  initializeSchema(sqlite);
  return sqlite;
}

export function getDb() {
  if (db) return db;

  const database = getSqlite();
  const callback: AsyncRemoteCallback = async (query, params, method) => {
    const statement = database.prepare(query);
    const values = params as SQLInputValue[];
    if (method === "run") {
      const result = statement.run(...values);
      return { rows: [[result.changes, result.lastInsertRowid]] };
    }
    if (method === "get") {
      const row = statement.get(...values) as Record<string, unknown> | undefined;
      return { rows: (row ? Object.values(row) : undefined) as unknown as unknown[] };
    }
    const rows = statement.all(...values) as Record<string, unknown>[];
    return { rows: rowsAsArrays(rows) };
  };
  db = drizzle(callback, { schema });

  return db;
}
