/**
 * Build dynamic SET clause for UPDATE from a partial object.
 * Returns { clause: "col1 = $offset, col2 = $offset+1", values: [...] }
 */
export function buildSetClause(
  patch: Record<string, unknown>,
  startIdx = 1,
): { clause: string; values: unknown[] } {
  const entries = Object.entries(patch).filter(
    ([, v]) => v !== undefined,
  );
  const parts: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    const pgVal =
      val !== null && typeof val === "object" ? JSON.stringify(val) : val;
    parts.push(`${key} = $${startIdx + i}`);
    values.push(pgVal);
  }
  return { clause: parts.join(", "), values };
}

export function jsonOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return typeof val === "string" ? val : JSON.stringify(val);
}
