import type { DbAdapter } from "./db";
import { SQL_BLOCKED_TABLES, SQL_WRITE_TABLES } from "./types";

export type SqlMode = "read" | "write" | "blocked";

export interface SqlCheck {
  mode: SqlMode;
  reason?: string;
  tables: string[];
  sql: string;
}

const ALL_TABLES = [
  ...SQL_WRITE_TABLES,
  ...SQL_BLOCKED_TABLES,
  "users",
  "admin_users",
  "audit_log",
  "redeem_codes",
  "sql_query_history",
];

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function checkSql(rawSql: string, requestedMode: "read" | "write"): SqlCheck {
  const sql = stripComments(String(rawSql ?? "")).trim().replace(/;+\s*$/, "");
  if (!sql) return { mode: "blocked", reason: "Empty statement", tables: [], sql };

  if (sql.includes(";")) {
    return { mode: "blocked", reason: "Multiple statements are not allowed", tables: [], sql };
  }

  const first = sql.match(/^[a-zA-Z]+/)?.[0]?.toUpperCase() ?? "";
  const tables = ALL_TABLES.filter((table) => new RegExp(`\\b${table}\\b`, "i").test(sql));

  if (!["SELECT", "WITH", "EXPLAIN", "PRAGMA", "SHOW", "INSERT", "UPDATE", "DELETE"].includes(first)) {
    return {
      mode: "blocked",
      reason: `Statement type ${first || "unknown"} is not allowed`,
      tables,
      sql,
    };
  }

  if (first === "PRAGMA" && !/^\s*PRAGMA\s+(table_info|table_list|index_list|database_list|user_version)\b/i.test(sql)) {
    return { mode: "blocked", reason: "Only read-only PRAGMA is allowed", tables, sql };
  }

  // A CTE is only safe if it contains no data-changing statement.
  if (first === "WITH" && /\b(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
    return { mode: "blocked", reason: "Data-changing CTEs are blocked; use write mode with a single statement", tables, sql };
  }

  if (requestedMode === "read") {
    if (["INSERT", "UPDATE", "DELETE"].includes(first)) {
      return { mode: "blocked", reason: "Write statement sent in read mode", tables, sql };
    }
    const limited =
      first === "SELECT" && !/\bLIMIT\b/i.test(sql) ? `${sql} LIMIT 1000` : sql;
    return { mode: "read", tables, sql: limited };
  }

  if (!["INSERT", "UPDATE", "DELETE"].includes(first)) {
    return { mode: "blocked", reason: "Write mode requires INSERT, UPDATE or DELETE", tables, sql };
  }

  const forbidden = tables.find((t) => SQL_BLOCKED_TABLES.has(t));
  if (forbidden) {
    return { mode: "blocked", reason: `Table ${forbidden} is protected and cannot be written from the UI`, tables, sql };
  }
  if (!tables.length) {
    return { mode: "blocked", reason: "Could not identify target table", tables, sql };
  }
  const unknown = tables.find((t) => !SQL_WRITE_TABLES.has(t));
  if (unknown) {
    return { mode: "blocked", reason: `Table ${unknown} is not in the write allowlist`, tables, sql };
  }
  if (/\bDELETE\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
    return { mode: "blocked", reason: "DELETE without WHERE is blocked", tables, sql };
  }
  if (/\bUPDATE\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
    return { mode: "blocked", reason: "UPDATE without WHERE is blocked", tables, sql };
  }

  return { mode: "write", tables, sql };
}

class RollbackSentinel extends Error {}

export interface SqlRunResult {
  rows: any[];
  fields: string[];
  changes: number;
  preview: boolean;
}

export async function runSql(
  db: DbAdapter,
  check: SqlCheck,
  params: any[],
  previewOnly: boolean,
): Promise<SqlRunResult> {
  if (check.mode === "read") {
    const rows = await db.all(check.sql, params);
    return { rows, fields: Object.keys(rows[0] ?? {}), changes: 0, preview: false };
  }
  if (check.mode !== "write") throw new Error(check.reason ?? "Statement blocked");

  let changes = 0;
  try {
    await db.transaction(async (tx) => {
      changes = await tx.run(check.sql, params);
      if (previewOnly) throw new RollbackSentinel("preview");
    });
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error;
  }
  return { rows: [], fields: [], changes, preview: previewOnly };
}
