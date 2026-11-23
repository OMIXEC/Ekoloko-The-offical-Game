import * as path from "path";
import type { Dialect } from "./schema";
import { schemaFor } from "./schema";

export interface QueryResult {
  rows: any[];
  fields: string[];
  changes: number;
}

export interface DbAdapter {
  readonly dialect: Dialect;
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any | undefined>;
  run(sql: string, params?: any[]): Promise<number>;
  insert(sql: string, params?: any[]): Promise<number>;
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Convert `?` placeholders to `$1, $2, ...` for Postgres. */
export function q(sql: string, dialect: Dialect): string {
  if (dialect === "sqlite") return sql;
  let i = 0;
  // Replace only outside single-quoted literals; our SQL is generated internally.
  return sql.replace(/'(?:[^']|'')*'|\?/g, (token) => (token === "?" ? `$${++i}` : token));
}

function fieldsOf(rows: any[]): string[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
}

// ── SQLite ────────────────────────────────────────────────────────────────

class SqliteAdapter implements DbAdapter {
  readonly dialect: Dialect = "sqlite";
  private db: any;

  constructor(filePath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sqlite = require("better-sqlite3") as any;
    this.db = new Sqlite(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(schemaFor("sqlite"));
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    return this.db.prepare(sql).all(...params) as any[];
  }

  async get(sql: string, params: any[] = []): Promise<any | undefined> {
    return this.db.prepare(sql).get(...params) as any;
  }

  async run(sql: string, params: any[] = []): Promise<number> {
    const info = this.db.prepare(sql).run(...params);
    return Number(info.changes ?? 0);
  }

  async insert(sql: string, params: any[] = []): Promise<number> {
    const info = this.db.prepare(sql).run(...params);
    return Number(info.lastInsertRowid ?? 0);
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

// ── Postgres ──────────────────────────────────────────────────────────────

class PostgresAdapter implements DbAdapter {
  readonly dialect: Dialect = "postgres";
  private pool: any;
  private client: any = null;

  constructor(connectionString?: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as any;
    this.pool = new Pool({
      ...(connectionString ? { connectionString } : {}),
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }

  private async initialize(): Promise<void> {
    await this.pool.query(schemaFor("postgres"));
  }

  static async create(connectionString?: string): Promise<PostgresAdapter> {
    const adapter = new PostgresAdapter(connectionString);
    await adapter.initialize();
    return adapter;
  }

  private conn(): any {
    return this.client ?? this.pool;
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const result = await this.conn().query(q(sql, this.dialect), params);
    return result.rows;
  }

  async get(sql: string, params: any[] = []): Promise<any | undefined> {
    const result = await this.conn().query(q(sql, this.dialect), params);
    return result.rows[0];
  }

  async run(sql: string, params: any[] = []): Promise<number> {
    const result = await this.conn().query(q(sql, this.dialect), params);
    return result.rowCount ?? 0;
  }

  async insert(sql: string, params: any[] = []): Promise<number> {
    const result = await this.conn().query(`${q(sql, this.dialect)} RETURNING id`, params);
    return Number(result.rows[0]?.id ?? 0);
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const previous = this.client;
    this.client = client;
    try {
      await client.query("BEGIN");
      const result = await fn(this);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      this.client = previous;
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface DbConfig {
  driver: Dialect;
  sqlitePath?: string;
  databaseUrl?: string;
}

export async function createDb(config: DbConfig): Promise<DbAdapter> {
  if (config.driver === "postgres") {
    // With no DATABASE_URL, node-postgres uses PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.
    return PostgresAdapter.create(config.databaseUrl);
  }
  const sqlitePath =
    config.sqlitePath ?? path.resolve(__dirname, "../../database/ekoloko.db");
  return new SqliteAdapter(sqlitePath);
}

export { fieldsOf };
