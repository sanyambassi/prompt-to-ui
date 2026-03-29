"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { updateStudioScreen } from "@/actions/studio/screens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedCallback } from "@/hooks/useDebounced";
import {
  COLOR_PRESET_SWATCHES,
  fontSizeOptions,
  fontWeightOptions,
  getEditableTextState,
  readTypographyAndColors,
  supportsInlineElementEdit,
  type EditableTextField,
  type StudioFontSize,
  type StudioFontWeight,
} from "@/lib/schema/element-edit-utils";
import { findUiSchemaNodeById } from "@/lib/schema/find-ui-schema-node";
import { migrateSchemaToLatest } from "@/lib/schema/migrate";
import { patchUiSchemaNodeById } from "@/lib/schema/patch-ui-schema-node";
import type { UISchema } from "@/lib/schema/types";
import type { StudioScreenRow } from "@/types/studio";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";
import { Eraser, Type, X } from "lucide-react";

const PANEL_W = 300;
const PANEL_MAX_H = 420;

function hasFill(style: Record<string, unknown> | undefined): boolean {
  if (!style) return false;
  return (
    typeof style.backgroundColor === "string" ||
    typeof style.bg === "string" ||
    typeof style.background === "string"
  );
}

function buildPatchedNode(
  node: UISchema,
  draftText: string,
  textField: EditableTextField,
  fontSize: StudioFontSize,
  fontWeight: StudioFontWeight,
  textColor: string,
  fillEnabled: boolean,
  fillColor: string,
): UISchema {
  const nextProps: Record<string, unknown> = {
    ...(node.props && typeof node.props === "object" ? node.props : {}),
  };
  if (textField === "placeholder") {
    nextProps.placeholder = draftText;
  } else if (textField === "label") {
    nextProps.label = draftText;
    delete nextProps.text;
  } else {
    nextProps.text = draftText;
    if (node.type === "button" || node.type === "badge") {
      nextProps.label = draftText;
    }
  }
  const nextStyle: Record<string, unknown> = {
    ...(node.style && typeof node.style === "object" ? node.style : {}),
  };
  nextStyle.fontSize = fontSize;
  nextStyle.fontWeight = fontWeight;
  nextStyle.color = textColor;
  delete nextStyle.textColor;
  if (fillEnabled) {
    nextStyle.backgroundColor = fillColor;
    delete nextStyle.bg;
    delete nextStyle.background;
  } else {
    delete nextStyle.backgroundColor;
    delete nextStyle.bg;
    delete nextStyle.background;
  }
  return { ...node, props: nextProps, style: nextStyle };
}

function readSnapshot(screenId: string, nodeId: string) {
  const sc = useEditorStore.getState().screens.find((s) => s.id === screenId);
  if (!sc) return null;
  const root = migrateSchemaToLatest(sc.ui_schema);
  const n = findUiSchemaNodeById(root, nodeId);
  if (!n || !supportsInlineElementEdit(n)) return null;
  const t = getEditableTextState(n);
  const ty = readTypographyAndColors(
    n.style as Record<string, unknown> | undefined,
  );
  return {
    node: n,
    ...t,
    ...ty,
    fillEnabled: hasFill(n.style as Record<string, unknown> | undefined),
  };
}

type Props = {
  screen: StudioScreenRow;
  selectedNodeId: string;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  editEnabled: boolean;
};

/**
 * Floating inline editor for text, font, and color of a selected schema node.
 * Parent MUST use `key={selectedNodeId}` to remount when the selection changes.
 */
export function SchemaElementEditPopover({
  screen,
  selectedNodeId,
  scrollContainerRef,
  editEnabled,
}: Props) {
  const snap = readSnapshot(screen.id, selectedNodeId);

  const updateScreenLocal = useEditorStore((s) => s.updateScreenLocal);
  const upsertScreen = useEditorStore((s) => s.upsertScreen);
  const setSelectedSchemaNodeId = useEditorStore(
    (s) => s.setSelectedSchemaNodeId,
  );

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const patchingRef = useRef(false);

  const [draftText, setDraftText] = useState(snap?.value ?? "");
  const [textField] = useState<EditableTextField>(snap?.field ?? "text");
  const [fontSize, setFontSize] = useState<StudioFontSize>(snap?.fontSize ?? "sm");
  const [fontWeight, setFontWeight] = useState<StudioFontWeight>(snap?.fontWeight ?? "normal");
  const [textColor, setTextColor] = useState(snap?.textColor ?? "#1a1a1a");
  const [fillEnabled, setFillEnabled] = useState(snap?.fillEnabled ?? false);
  const [fillColor, setFillColor] = useState(snap?.fillColor ?? "#ffffff");

  const persist = useCallback(async () => {
    const sc = useEditorStore.getState().screens.find((s) => s.id === screen.id);
    if (!sc) return;
    const r = await updateStudioScreen(screen.id, { ui_schema: sc.ui_schema });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    upsertScreen(r.data);
  }, [screen.id, upsertScreen]);

  const debouncedPersist = useDebouncedCallback(persist, 700);

  const applyLocalPatch = useCallback(() => {
    const sc = useEditorStore.getState().screens.find((s) => s.id === screen.id);
    if (!sc) return;
    const root = migrateSchemaToLatest(sc.ui_schema);
    const n = findUiSchemaNodeById(root, selectedNodeId);
    if (!n || !supportsInlineElementEdit(n)) return;
    patchingRef.current = true;
    const patched = patchUiSchemaNodeById(root, selectedNodeId, (el) =>
      buildPatchedNode(el, draftText, textField, fontSize, fontWeight, textColor, fillEnabled, fillColor),
    );
    updateScreenLocal(screen.id, { ui_schema: patched as UISchema });
    patchingRef.current = false;
    debouncedPersist();
  }, [
    debouncedPersist, draftText, fillColor, fillEnabled, fontSize,
    fontWeight, screen.id, selectedNodeId, textColor, textField,
    updateScreenLocal,
  ]);

  useEffect(() => {
    if (!snap) return;
    applyLocalPatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire when any draft value changes
  }, [draftText, fillColor, fillEnabled, fontSize, fontWeight, textColor]);

  const recomputePosition = useCallback(() => {
    if (!editEnabled || !scrollContainerRef.current) {
      setPos(null);
      return;
    }
    const esc = CSS.escape ?? ((s: string) => s.replace(/[^a-zA-Z0-9_-]/g, ""));
    const el = scrollContainerRef.current.querySelector(
      `[data-studio-id="${esc(selectedNodeId)}"]`,
    ) as HTMLElement | null;
    if (!el) { setPos(null); return; }
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + margin;
    let top = rect.top;
    if (left + PANEL_W > vw - margin) left = rect.left - PANEL_W - margin;
    if (left < margin) left = margin;
    const ph = Math.min(PANEL_MAX_H, panelRef.current?.offsetHeight ?? PANEL_MAX_H);
    if (top + ph > vh - margin) top = Math.max(margin, vh - ph - margin);
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [editEnabled, scrollContainerRef, selectedNodeId]);

  useLayoutEffect(() => {
    recomputePosition();
  }, [recomputePosition, draftText, fontSize, selectedNodeId]);

  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => recomputePosition());
    ro.observe(sc);
    sc.addEventListener("scroll", recomputePosition, { passive: true });
    window.addEventListener("resize", recomputePosition);
    window.addEventListener("scroll", recomputePosition, true);
    return () => {
      ro.disconnect();
      sc.removeEventListener("scroll", recomputePosition);
      window.removeEventListener("resize", recomputePosition);
      window.removeEventListener("scroll", recomputePosition, true);
    };
  }, [recomputePosition, scrollContainerRef]);

  if (!snap || !snap.node || typeof document === "undefined" || !editEnabled || !pos) {
    return null;
  }

  const { node } = snap;
  const multiline = node.type === "paragraph" || node.type === "text" || node.type === "textarea";
  const textLabel =
    textField === "placeholder" ? "Placeholder"
    : node.type === "link" ? "Link text"
    : node.type === "button" ? "Button label"
    : "Text";

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Edit selected element"
      className={cn(
        "fixed z-[200] flex max-h-[min(420px,82vh)] w-[min(300px,90vw)] flex-col overflow-hidden rounded-2xl border border-border/50",
        "bg-popover/95 text-popover-foreground shadow-2xl shadow-black/20 backdrop-blur-xl dark:shadow-black/50",
        "animate-in fade-in-0 slide-in-from-left-2 duration-150",
      )}
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-muted/25 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--workspace-accent-soft)]">
            <Type className="size-3.5 text-[var(--workspace-accent)]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-tight">Edit element</p>
            <p className="text-muted-foreground truncate font-mono text-[0.6rem] leading-snug">
              {node.type} · {node.id.length > 12 ? `${node.id.slice(0, 12)}…` : node.id}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-lg"
          aria-label="Close element editor"
          onClick={() => setSelectedSchemaNodeId(null)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3 [scrollbar-gutter:stable]">
        <div className="space-y-1.5">
          <Label className="text-[0.7rem] font-medium">{textLabel}</Label>
          {multiline ?
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="min-h-[68px] max-h-[180px] resize-y text-sm"
              rows={3}
            />
          : <Input
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="h-9 text-sm"
            />
          }
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[0.65rem] font-medium">Size</Label>
            <Select value={fontSize} onValueChange={(v) => setFontSize(v as StudioFontSize)}>
              <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fontSizeOptions().map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] font-medium">Weight</Label>
            <Select value={fontWeight} onValueChange={(v) => setFontWeight(v as StudioFontWeight)}>
              <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fontWeightOptions().map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[0.65rem] font-medium">Text color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="size-8 cursor-pointer rounded-lg border border-border/60 bg-background p-0.5"
              aria-label="Pick text color"
            />
            <Input
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESET_SWATCHES.map((s) => (
              <button
                key={s.label}
                type="button"
                title={s.label}
                className={cn(
                  "size-6 rounded-lg border shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]",
                  textColor.toLowerCase() === s.hex.toLowerCase()
                    ? "border-[var(--workspace-accent)] ring-1 ring-[var(--workspace-accent)]"
                    : "border-border/50",
                )}
                style={{ backgroundColor: s.hex }}
                onClick={() => setTextColor(s.hex)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border/30 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[0.65rem] font-medium">Background</Label>
            <Button
              type="button"
              variant={fillEnabled ? "secondary" : "outline"}
              size="sm"
              className="h-6 rounded-md px-2 text-[0.6rem] font-semibold"
              onClick={() => setFillEnabled((v) => !v)}
            >
              {fillEnabled ? "On" : "Off"}
            </Button>
          </div>
          {fillEnabled && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => setFillColor(e.target.value)}
                  className="size-8 cursor-pointer rounded-lg border border-border/60 bg-background p-0.5"
                  aria-label="Pick fill color"
                />
                <Input
                  value={fillColor}
                  onChange={(e) => setFillColor(e.target.value)}
                  className="h-8 min-w-0 flex-1 font-mono text-xs"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  title="Clear background"
                  onClick={() => setFillEnabled(false)}
                >
                  <Eraser className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {COLOR_PRESET_SWATCHES.map((s) => (
                  <button
                    key={`bg-${s.label}`}
                    type="button"
                    title={s.label}
                    className={cn(
                      "size-6 rounded-lg border shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]",
                      fillColor.toLowerCase() === s.hex.toLowerCase()
                        ? "border-[var(--workspace-accent)] ring-1 ring-[var(--workspace-accent)]"
                        : "border-border/50",
                    )}
                    style={{ backgroundColor: s.hex }}
                    onClick={() => { setFillColor(s.hex); setFillEnabled(true); }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
