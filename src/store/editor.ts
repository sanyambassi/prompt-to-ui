import { create } from "zustand";
import { temporal } from "zundo";
import type { UISchema } from "@/lib/schema/types";
import { replaceHtmlImageSrc } from "@/lib/schema/walk-image-nodes";
import { getHtmlDocumentString } from "@/lib/schema/html-document";
import { compareScreensDisplayOrder } from "@/lib/studio/screen-display-order";
import type {
  StudioAssetRow,
  StudioProjectRow,
  StudioPrototypeLinkRow,
  StudioScreenRow,
  StudioVariantRow,
} from "@/types/studio";

export type EditorViewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type EditorStoreState = {
  projectId: string | null;
  projectName: string;
  projectRow: StudioProjectRow | null;
  screens: StudioScreenRow[];
  activeScreenId: string | null;
  /** UISchema node id on the active screen (for AI “edit this element”). */
  selectedSchemaNodeId: string | null;
  activeVariantId: string | null;
  leftOpen: boolean;
  rightOpen: boolean;
  prototypeMode: boolean;
  /** Predictive click-intent overlay on artboards (heatmap). */
  heatmapMode: boolean;
  viewport: EditorViewport;
  gridVisible: boolean;
  assets: StudioAssetRow[];
  prototypeLinks: StudioPrototypeLinkRow[];
  /** screen_id → variants for that artboard */
  variantsByScreen: Record<string, StudioVariantRow[]>;
};

export type StudioHydrateLibrary = {
  assets?: StudioAssetRow[];
  prototypeLinks?: StudioPrototypeLinkRow[];
  variants?: StudioVariantRow[];
};

type EditorActions = {
  hydrate: (
    project: StudioProjectRow,
    screens: StudioScreenRow[],
    library?: StudioHydrateLibrary,
  ) => void;
  reset: () => void;
  setProjectNameLocal: (name: string) => void;
  setProjectRow: (row: StudioProjectRow) => void;
  setScreens: (screens: StudioScreenRow[]) => void;
  upsertScreen: (screen: StudioScreenRow) => void;
  removeScreen: (id: string) => void;
  setActiveScreen: (id: string | null) => void;
  setSelectedSchemaNodeId: (id: string | null) => void;
  updateScreenLocal: (
    id: string,
    patch: Partial<
      Pick<
        StudioScreenRow,
        | "name"
        | "canvas_x"
        | "canvas_y"
        | "width"
        | "height"
        | "ui_schema"
        | "sort_order"
      >
    >,
  ) => void;
  setViewport: (v: Partial<EditorViewport>) => void;
  setViewportImmediate: (v: EditorViewport) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleGrid: () => void;
  setPrototypeMode: (v: boolean) => void;
  toggleHeatmapMode: () => void;
  /** Fit all artboards + padding into container size (CSS px). */
  fitToContainer: (containerW: number, containerH: number) => void;

  upsertAsset: (row: StudioAssetRow) => void;
  removeAsset: (id: string) => void;
  upsertVariant: (row: StudioVariantRow) => void;
  removeVariant: (id: string, screenId: string) => void;
  setVariantsForScreen: (screenId: string, rows: StudioVariantRow[]) => void;
  replaceAllVariantsFromServer: (rows: StudioVariantRow[]) => void;
  upsertPrototypeLink: (row: StudioPrototypeLinkRow) => void;
  removePrototypeLink: (id: string) => void;
  setPrototypeLinks: (rows: StudioPrototypeLinkRow[]) => void;
  /** Patch a single image node's src across all screens (used for live image_done SSE). */
  patchImageSrc: (nodeId: string, newSrc: string) => void;
};

const defaultViewport = (): EditorViewport => ({
  panX: 0,
  panY: 0,
  zoom: 1,
});

const viewportFromProject = (
  vp: StudioProjectRow["canvas_viewport"] | undefined,
): EditorViewport => ({
  panX: typeof vp?.panX === "number" ? vp.panX : 0,
  panY: typeof vp?.panY === "number" ? vp.panY : 0,
  zoom:
    typeof vp?.zoom === "number" && vp.zoom > 0 && Number.isFinite(vp.zoom)
      ? vp.zoom
      : 1,
});

/** Same canvas_viewport from the server → keep live pan/zoom (e.g. after theme save). */
function viewportEqual(
  a: StudioProjectRow["canvas_viewport"] | undefined,
  b: StudioProjectRow["canvas_viewport"] | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.panX === b.panX && a.panY === b.panY && a.zoom === b.zoom;
}

function groupVariantsByScreen(
  rows: StudioVariantRow[],
): Record<string, StudioVariantRow[]> {
  const out: Record<string, StudioVariantRow[]> = {};
  for (const v of rows) {
    (out[v.screen_id] ??= []).push(v);
  }
  return out;
}

const initialState: EditorStoreState = {
  projectId: null,
  projectName: "",
  projectRow: null,
  screens: [],
  activeScreenId: null,
  selectedSchemaNodeId: null,
  activeVariantId: null,
  leftOpen: true,
  rightOpen: true,
  prototypeMode: false,
  heatmapMode: false,
  viewport: defaultViewport(),
  gridVisible: false,
  assets: [],
  prototypeLinks: [],
  variantsByScreen: {},
};

/** Recursively walk a plain-object UISchema tree and set props.src on the first node matching nodeId. */
function patchNodeSrcDeep(node: Record<string, unknown>, nodeId: string, src: string): boolean {
  if (node.id === nodeId) {
    const props = (node.props ?? {}) as Record<string, unknown>;
    props.src = src;
    node.props = props;
    return true;
  }
  const children = node.children as Record<string, unknown>[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === "object" && patchNodeSrcDeep(child, nodeId, src)) return true;
    }
  }
  return false;
}

export const useEditorStore = create<EditorStoreState & EditorActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      hydrate: (project, screens, library) => {
        useEditorStore.temporal.getState().clear();
        const sorted = [...screens].sort(compareScreensDisplayOrder);
        set({
          projectId: project.id,
          projectName: project.name,
          projectRow: project,
          screens: sorted,
          activeScreenId: sorted[0]?.id ?? null,
          selectedSchemaNodeId: null,
          activeVariantId: null,
          leftOpen: true,
          rightOpen: true,
          prototypeMode: false,
          heatmapMode: false,
          gridVisible: false,
          viewport: viewportFromProject(project.canvas_viewport),
          assets: [...(library?.assets ?? [])].sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
          prototypeLinks: [...(library?.prototypeLinks ?? [])],
          variantsByScreen: groupVariantsByScreen(library?.variants ?? []),
        });
      },

      reset: () => {
        set({ ...initialState, viewport: defaultViewport() });
      },

      setProjectNameLocal: (name) => set({ projectName: name }),

      setProjectRow: (row) =>
        set((s) => {
          const prev = s.projectRow;
          const sameProject = prev?.id === row.id;
          const keepViewport =
            sameProject && viewportEqual(prev.canvas_viewport, row.canvas_viewport);
          return {
            projectRow: row,
            projectName: row.name,
            viewport: keepViewport ? s.viewport : viewportFromProject(row.canvas_viewport),
          };
        }),

      setScreens: (screens) => {
        const byId = new Map<string, StudioScreenRow>();
        for (const sc of screens) byId.set(sc.id, sc);
        set({ screens: [...byId.values()].sort(compareScreensDisplayOrder) });
      },

      upsertScreen: (screen) =>
        set((s) => {
          const i = s.screens.findIndex((x) => x.id === screen.id);
          const next =
            i === -1
              ? [...s.screens, screen]
              : s.screens.map((x) => (x.id === screen.id ? screen : x));
          return {
            screens: next.sort(compareScreensDisplayOrder),
          };
        }),

      removeScreen: (id) =>
        set((s) => {
          const screens = [...s.screens.filter((x) => x.id !== id)].sort(
            compareScreensDisplayOrder,
          );
          const nextActive =
            s.activeScreenId === id ? screens[0]?.id ?? null : s.activeScreenId;
          const variantsByScreen = { ...s.variantsByScreen };
          delete variantsByScreen[id];
          return {
            screens,
            activeScreenId: nextActive,
            selectedSchemaNodeId:
              s.activeScreenId === id ? null : s.selectedSchemaNodeId,
            variantsByScreen,
            prototypeLinks: s.prototypeLinks.filter(
              (l) => l.screen_id !== id && l.target_screen_id !== id,
            ),
          };
        }),

      setActiveScreen: (id) =>
        set({ activeScreenId: id, selectedSchemaNodeId: null }),

      setSelectedSchemaNodeId: (nodeId) =>
        set({ selectedSchemaNodeId: nodeId }),

      updateScreenLocal: (id, patch) =>
        set((s) => ({
          screens: s.screens.map((sc) =>
            sc.id === id ? { ...sc, ...patch } : sc,
          ),
        })),

      setViewport: (v) =>
        set((s) => ({
          viewport: { ...s.viewport, ...v },
        })),

      setViewportImmediate: (v) => set({ viewport: v }),

      toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
      setPrototypeMode: (v) => set({ prototypeMode: v }),

      toggleHeatmapMode: () =>
        set((s) => ({ heatmapMode: !s.heatmapMode })),

      upsertAsset: (row) =>
        set((s) => {
          const i = s.assets.findIndex((x) => x.id === row.id);
          const next =
            i === -1 ? [row, ...s.assets] : s.assets.map((x) => (x.id === row.id ? row : x));
          return {
            assets: next.sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            ),
          };
        }),

      removeAsset: (id) =>
        set((s) => ({ assets: s.assets.filter((x) => x.id !== id) })),

      upsertVariant: (row) =>
        set((s) => {
          const list = [...(s.variantsByScreen[row.screen_id] ?? [])];
          const i = list.findIndex((x) => x.id === row.id);
          if (i === -1) list.push(row);
          else list[i] = row;
          return {
            variantsByScreen: {
              ...s.variantsByScreen,
              [row.screen_id]: list,
            },
          };
        }),

      removeVariant: (id, screenId) =>
        set((s) => {
          const list = (s.variantsByScreen[screenId] ?? []).filter(
            (x) => x.id !== id,
          );
          const variantsByScreen = { ...s.variantsByScreen };
          if (list.length === 0) delete variantsByScreen[screenId];
          else variantsByScreen[screenId] = list;
          return { variantsByScreen };
        }),

      setVariantsForScreen: (screenId, rows) =>
        set((s) => {
          const variantsByScreen = { ...s.variantsByScreen };
          if (rows.length === 0) delete variantsByScreen[screenId];
          else variantsByScreen[screenId] = rows;
          return { variantsByScreen };
        }),

      replaceAllVariantsFromServer: (rows) =>
        set({ variantsByScreen: groupVariantsByScreen(rows) }),

      upsertPrototypeLink: (row) =>
        set((s) => {
          const i = s.prototypeLinks.findIndex((x) => x.id === row.id);
          const next =
            i === -1 ?
              [...s.prototypeLinks, row]
            : s.prototypeLinks.map((x) => (x.id === row.id ? row : x));
          return { prototypeLinks: next };
        }),

      removePrototypeLink: (id) =>
        set((s) => ({
          prototypeLinks: s.prototypeLinks.filter((x) => x.id !== id),
        })),

      setPrototypeLinks: (rows) => set({ prototypeLinks: rows }),

      patchImageSrc: (nodeId, newSrc) =>
        set((s) => {
          let changed = false;
          const screens: StudioScreenRow[] = s.screens.map((sc) => {
            const schema = sc.ui_schema as Record<string, unknown> | undefined;
            if (!schema) return sc;
            const cloned = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
            if (getHtmlDocumentString(cloned)) {
              replaceHtmlImageSrc(cloned as unknown as UISchema, nodeId, newSrc);
              changed = true;
              return { ...sc, ui_schema: cloned as UISchema };
            }
            if (patchNodeSrcDeep(cloned, nodeId, newSrc)) {
              changed = true;
              return { ...sc, ui_schema: cloned as UISchema };
            }
            return sc;
          });
          return changed ? { screens } : {};
        }),

      fitToContainer: (containerW, containerH) => {
        const { screens } = get();
        if (screens.length === 0 || containerW < 32 || containerH < 32) {
          set({ viewport: { panX: 40, panY: 40, zoom: 0.5 } });
          return;
        }
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const sc of screens) {
          minX = Math.min(minX, sc.canvas_x);
          minY = Math.min(minY, sc.canvas_y);
          maxX = Math.max(maxX, sc.canvas_x + sc.width);
          maxY = Math.max(maxY, sc.canvas_y + sc.height);
        }
        const pad = 80;
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const zx = containerW / bw;
        const zy = containerH / bh;
        const zoom = Math.max(0.08, Math.min(1.2, Math.min(zx, zy)));
        const panX = (containerW - bw * zoom) / 2 - minX * zoom + pad * zoom;
        const panY = (containerH - bh * zoom) / 2 - minY * zoom + pad * zoom;
        set({ viewport: { panX, panY, zoom } });
      },
    }),
    {
      limit: 100,
      // Undo/redo: screen list & geometry/schema only (not pan/zoom).
      partialize: (state) => ({ screens: state.screens }),
    },
  ),
);

export function editorUndo() {
  useEditorStore.temporal.getState().undo();
}

export function editorRedo() {
  useEditorStore.temporal.getState().redo();
}
