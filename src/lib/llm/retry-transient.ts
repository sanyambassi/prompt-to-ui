function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name} ${e.message}`;
  return String(e);
}

/** Heuristic: provider rate limits, overload, and network blips. */
export function isTransientLlmError(e: unknown): boolean {
  const t = errorText(e).toLowerCase();
  return (
    t.includes("429") ||
    t.includes("rate limit") ||
    t.includes("rate_limit") ||
    t.includes("503") ||
    t.includes("502") ||
    t.includes("500") ||
    t.includes("overloaded") ||
    t.includes("timeout") ||
    t.includes("timed out") ||
    t.includes("econnreset") ||
    t.includes("socket") ||
    t.includes("fetch failed") ||
    t.includes("temporarily unavailable")
  );
}

export type WithRetriesOptions = {
  maxAttempts?: number;
  delaysMs?: number[];
};

/**
 * Runs an async function with a few retries on transient failures.
 */
export async function withTransientRetries<T>(
  fn: () => Promise<T>,
  options?: WithRetriesOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const delays = options?.delaysMs ?? [1200, 2800, 5000];
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt >= maxAttempts - 1 || !isTransientLlmError(e)) throw e;
      await sleep(delays[attempt] ?? 2000);
    }
  }
  throw last;
}
