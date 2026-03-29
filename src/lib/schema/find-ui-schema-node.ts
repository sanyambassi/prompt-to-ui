import type { UISchema } from "@/lib/schema/types";

export function findUiSchemaNodeById(
  root: UISchema,
  id: string,
): UISchema | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const found = findUiSchemaNodeById(c, id);
    if (found) return found;
  }
  return null;
}
