import { useCallback, useRef } from "react";
import { updateStudioProject } from "@/actions/studio/projects";
import type { CanvasItem } from "@/store/canvas-items";
import { useCanvasItemsStore } from "@/store/canvas-items";

function sanitizeForPersistence(items: CanvasItem[]): CanvasItem[] {
  return items
    .filter((item) => {
      if (item.type === "image" && item.loading && !item.imageUrl) return false;
      return true;
    })
    .map((item) => {
      if (item.type === "image" && item.loading) {
        return { ...item, loading: false };
      }
      return item;
    });
}

function persistNow(projectId: string, items: CanvasItem[]) {
  const cleaned = sanitizeForPersistence(items);
  void updateStudioProject(projectId, {
    canvas_document: { items: cleaned } as Record<string, unknown>,
  });
}

export function useCanvasPersistence(projectId: string) {
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);
  const prevCountRef = useRef<number | null>(null);

  const latestItemsRef = useRef<CanvasItem[]>([]);
  const retryRef = useRef(false);

  const flushSave = useCallback(async () => {
    if (disposedRef.current) return;
    if (pendingRef.current) {
      retryRef.current = true;
      return;
    }
    pendingRef.current = true;
    try {
      const cleaned = sanitizeForPersistence(latestItemsRef.current);
      await updateStudioProject(projectId, {
        canvas_document: { items: cleaned } as Record<string, unknown>,
      });
    } catch {
      retryRef.current = true;
    } finally {
      pendingRef.current = false;
      if (retryRef.current && !disposedRef.current) {
        retryRef.current = false;
        timerRef.current = setTimeout(() => void flushSave(), 2000);
      }
    }
  }, [projectId]);

  const saveItems = useCallback(
    (items: CanvasItem[]) => {
      if (disposedRef.current) return;
      const isFirstCall = prevCountRef.current === null;
      const wasEmpty = prevCountRef.current === 0;
      prevCountRef.current = items.length;
      latestItemsRef.current = items;
      if (items.length === 0 && (isFirstCall || wasEmpty)) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flushSave(), 2000);
    },
    [flushSave],
  );

  const dispose = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const items = useCanvasItemsStore.getState().items;
    persistNow(projectId, items);
    disposedRef.current = true;
  }, [projectId]);

  return { saveItems, dispose };
}
