import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import type { UISchema } from "@/lib/schema/types";
import type { StudioPrototypeLinkRow } from "@/types/studio";

export type HeatmapTarget = {
  id: string;
  /** 0–1 — drives color (hot = more clickable / higher intent). */
  intensity: number;
  /** Short label for tooltips / legend. */
  category: string;
};

function hasOutgoingClickLink(
  links: StudioPrototypeLinkRow[],
  screenId: string,
  nodeId: string,
): boolean {
  return links.some(
    (l) =>
      l.screen_id === screenId &&
      l.source_node_id === nodeId &&
      (l.trigger === "click" || l.trigger == null || l.trigger === ""),
  );
}

/**
 * Collect UISchema nodes that represent real UI affordances (not generic layout
 * wrappers that only gain onClick in edit mode).
 */
export function collectClickableHeatmapNodes(
  schema: UISchema,
  screenId: string,
  links: StudioPrototypeLinkRow[],
): HeatmapTarget[] {
  const root = migrateSchemaToLatest(schema);
  const out: HeatmapTarget[] = [];

  function walk(node: UISchema) {
    const proto = hasOutgoingClickLink(links, screenId, node.id);
    const ix =
      !!node.interactions && Object.keys(node.interactions).length > 0;

    let intensity = 0;
    let category = node.type;

    switch (node.type) {
      case "button":
      case "link":
        intensity = proto ? 1 : 0.78;
        category = proto ? "Prototype / nav" : "Button or link";
        break;
      case "input":
      case "textarea":
        intensity = 0.52;
        category = "Input field";
        break;
      case "form":
        intensity = 0.32;
        category = "Form";
        break;
      default:
        if (proto) {
          intensity = 0.92;
          category = "Prototype target";
        } else if (ix) {
          intensity = 0.42;
          category = "Interaction";
        }
    }

    if (intensity > 0) {
      out.push({ id: node.id, intensity, category });
    }

    for (const c of node.children ?? []) walk(c);
  }

  walk(root);
  return out;
}
