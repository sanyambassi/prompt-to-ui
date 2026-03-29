import { create } from "zustand";

export type CanvasItemType = "image" | "webframe";

export type ImageCanvasItemData = {
  type: "image";
  imageUrl: string;
  prompt: string;
  provider: string;
  canvasImageId: string;
  loading: boolean;
};

export type WebFrameCanvasItemData = {
  type: "webframe";
  screenId: string;
  deviceType: "phone" | "tablet" | "desktop";
};

export type CanvasItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
} & (ImageCanvasItemData | WebFrameCanvasItemData);

type CanvasItemsState = {
  items: CanvasItem[];
  selectedItemId: string | null;
};

type CanvasItemsActions = {
  addItem: (item: CanvasItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<CanvasItem>) => void;
  moveItem: (id: string, x: number, y: number) => void;
  bringToFront: (id: string) => void;
  setItems: (items: CanvasItem[]) => void;
  selectItem: (id: string | null) => void;
  getSerializable: () => CanvasItem[];
};

export const useCanvasItemsStore = create<CanvasItemsState & CanvasItemsActions>()(
  (set, get) => ({
    items: [],
    selectedItemId: null,

    addItem: (item) =>
      set((s) => {
        const idx = s.items.findIndex((x) => x.id === item.id);
        if (idx === -1) return { items: [...s.items, item] };
        return { items: s.items.map((x) => (x.id === item.id ? (item as CanvasItem) : x)) };
      }),

    removeItem: (id) =>
      set((s) => ({
        items: s.items.filter((i) => i.id !== id),
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      })),

    updateItem: (id, patch) =>
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, ...patch } as CanvasItem : i,
        ),
      })),

    moveItem: (id, x, y) =>
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, x, y } : i)),
      })),

    bringToFront: (id) =>
      set((s) => {
        const idx = s.items.findIndex((i) => i.id === id);
        if (idx < 0 || idx === s.items.length - 1) return s;
        const item = s.items[idx];
        return { items: [...s.items.slice(0, idx), ...s.items.slice(idx + 1), item] };
      }),

    setItems: (items) => set({ items }),

    selectItem: (id) => set({ selectedItemId: id }),

    getSerializable: () => get().items,
  }),
);
