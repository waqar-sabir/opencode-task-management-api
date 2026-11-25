import type { Pool, PoolClient } from "pg";

export interface TransactionOptions {
  /** Retries for serialization/deadlock failures before rethrowing. */
  readonly retries?: number;
}

const RETRYABLE_CODES = new Set(["40001", "40P01"]);

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as Error & { code?: string }).code === "string" &&
    RETRYABLE_CODES.has((error as Error & { code: string }).code)
  );
}

/**
 * Run `fn` inside a transaction on a checked-out client. The client is always
 * released, and serialization/deadlock failures are retried once by default.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  { retries = 1 }: TransactionOptions = {},
): Promise<T> {
  let attempt = 0;

  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }

      if (attempt < retries && isRetryable(error)) {
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
