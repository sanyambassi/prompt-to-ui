import { create } from "zustand";

export type PendingAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
};

type PendingAttachmentStore = {
  attachments: PendingAttachment[];
  addAttachment: (a: PendingAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  consumeAttachments: () => PendingAttachment[];
};

export const usePendingAttachments = create<PendingAttachmentStore>(
  (set, get) => ({
    attachments: [],
    addAttachment: (a) =>
      set((s) => {
        if (s.attachments.some((x) => x.id === a.id)) return s;
        return { attachments: [...s.attachments, a] };
      }),
    removeAttachment: (id) =>
      set((s) => {
        const removed = s.attachments.find((a) => a.id === id);
        if (removed?.previewUrl) {
          try { URL.revokeObjectURL(removed.previewUrl); } catch { /* ignore */ }
        }
        return { attachments: s.attachments.filter((a) => a.id !== id) };
      }),
    clearAttachments: () => {
      const prev = get().attachments;
      for (const a of prev) {
        try { URL.revokeObjectURL(a.previewUrl); } catch { /* ignore */ }
      }
      set({ attachments: [] });
    },
    consumeAttachments: () => {
      const current = get().attachments;
      set({ attachments: [] });
      // Caller owns the base64 data; revoke preview URLs to avoid blob leaks
      for (const a of current) {
        try { URL.revokeObjectURL(a.previewUrl); } catch { /* ignore */ }
      }
      return current;
    },
  }),
);
