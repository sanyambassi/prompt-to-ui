import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://studio:studio@db:5432/studio",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  const result = await pool.query(text, values);
  return { rows: result.rows as T[], rowCount: result.rowCount };
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<T | null> {
  const { rows } = await query<T>(text, values);
  return rows[0] ?? null;
}
