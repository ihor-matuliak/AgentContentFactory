import pg from "pg";
import { env } from "./env.js";

/** Спільний пул підключень до PostgreSQL. */
export const pool = new pg.Pool({ connectionString: env.databaseUrl });

pool.on("error", (err: Error) => {
  console.error("Несподівана помилка пулу PostgreSQL:", err);
});

/** Зручна обгортка над pool.query з типізацією рядків. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}
