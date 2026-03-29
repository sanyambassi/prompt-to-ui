/**
 * Walk a string tracking JSON structure depth; close any unclosed
 * brackets/braces/strings at the end.
 */
function closeOpenBrackets(raw: string): string {
  let t = raw;
  const opens: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") opens.push("}");
    else if (ch === "[") opens.push("]");
    else if (ch === "}" || ch === "]") opens.pop();
  }
  if (inStr) t += '"';
  t = t.replace(/,\s*$/, "");
  while (opens.length > 0) t += opens.pop();
  return t;
}

/**
 * Find the last position where JSON is structurally valid up to that
 * point (ends on a '}', ']', '"', digit, true/false/null boundary).
 * Then close all open brackets from there.
 */
function truncateAndClose(raw: string): string {
  const opens: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafeCut = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') {
      inStr = !inStr;
      if (!inStr) lastSafeCut = i + 1;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") { opens.push("}"); continue; }
    if (ch === "[") { opens.push("]"); continue; }
    if (ch === "}" || ch === "]") {
      opens.pop();
      lastSafeCut = i + 1;
      continue;
    }
    if (/[\d.eE+\-]/.test(ch)) { lastSafeCut = i + 1; continue; }
    if (ch === "," || ch === ":") { continue; }
  }

  let t = raw.slice(0, lastSafeCut);
  t = t.replace(/,\s*$/, "");
  return closeOpenBrackets(t);
}

function getJsonErrorPosition(err: unknown): number {
  if (!(err instanceof SyntaxError)) return -1;
  const m = /position\s+(\d+)/i.exec(err.message);
  return m ? parseInt(m[1], 10) : -1;
}

export function extractJsonObjectFromLlmText(raw: string): unknown {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  if (start < 0) {
    throw new Error("No JSON object found in model output");
  }
  const end = t.lastIndexOf("}");
  const jsonStr = t.slice(start);
  const candidate = end > start ? t.slice(start, end + 1) : jsonStr;

  try {
    return JSON.parse(candidate) as unknown;
  } catch { /* continue */ }

  try {
    const repaired = closeOpenBrackets(jsonStr);
    return JSON.parse(repaired) as unknown;
  } catch { /* continue */ }

  try {
    JSON.parse(candidate);
  } catch (err) {
    const pos = getJsonErrorPosition(err);
    if (pos > 20) {
      for (const offset of [0, -1, -2, -5, -10]) {
        const cutPos = pos + offset;
        if (cutPos < 10) continue;
        try {
          const closed = truncateAndClose(candidate.slice(0, cutPos));
          return JSON.parse(closed) as unknown;
        } catch { /* try next offset */ }
      }
    }
  }

  try {
    const closed = truncateAndClose(jsonStr);
    return JSON.parse(closed) as unknown;
  } catch { /* continue */ }

  throw new Error(
    `Invalid JSON from model (${candidate.length} chars). ` +
    `Could not repair. First 200 chars: ${candidate.slice(0, 200)}…`,
  );
}
