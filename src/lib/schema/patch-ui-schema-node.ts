import type { UISchema } from "@/lib/schema/types";

/**
 * Deep-immutable patch of a single node by `id`. Returns a new tree, or the
 * original reference if `nodeId` was not found.
 */
export function patchUiSchemaNodeById(
  root: UISchema,
  nodeId: string,
  patch: (node: UISchema) => UISchema,
): UISchema {
  const apply = (node: UISchema): { next: UISchema; hit: boolean } => {
    if (node.id === nodeId) {
      return { next: patch(structuredCloneLite(node)), hit: true };
    }
    const kids = node.children;
    if (!kids?.length) return { next: node, hit: false };

    let hit = false;
    const nextChildren: UISchema[] = [];
    for (const c of kids) {
      const r = apply(c);
      if (r.hit) hit = true;
      nextChildren.push(r.next);
    }
    if (!hit) return { next: node, hit: false };
    return { next: { ...node, children: nextChildren }, hit: true };
  };

  return apply(root).next;
}

/** Clone enough for a safe patch (props/style are replaced wholesale by callers). */
function structuredCloneLite(node: UISchema): UISchema {
  return {
    ...node,
    props:
      node.props && typeof node.props === "object" ?
        { ...node.props }
      : node.props,
    style:
      node.style && typeof node.style === "object" ?
        { ...node.style }
      : node.style,
    layout:
      node.layout && typeof node.layout === "object" ?
        { ...node.layout }
      : node.layout,
    interactions:
      node.interactions && typeof node.interactions === "object" ?
        { ...node.interactions }
      : node.interactions,
    children: node.children?.map(structuredCloneLite),
  };
}
