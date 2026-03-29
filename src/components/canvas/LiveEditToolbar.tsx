"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import {
  sendFormatCommand,
  type IframeSelectionState,
} from "@/lib/schema/inject-live-editor";

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Inter", value: "Inter" },
  { label: "Roboto", value: "Roboto" },
  { label: "Open Sans", value: "Open Sans" },
  { label: "Lato", value: "Lato" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Poppins", value: "Poppins" },
  { label: "Raleway", value: "Raleway" },
  { label: "Nunito", value: "Nunito" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "Merriweather", value: "Merriweather" },
  { label: "Source Code Pro", value: "Source Code Pro" },
  { label: "DM Sans", value: "DM Sans" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "Work Sans", value: "Work Sans" },
  { label: "Outfit", value: "Outfit" },
  { label: "Arial", value: "Arial" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Verdana", value: "Verdana" },
];

const FONT_SIZES = [
  "10px", "11px", "12px", "13px", "14px", "16px", "18px",
  "20px", "24px", "28px", "32px", "36px", "40px", "48px",
  "56px", "64px", "72px", "96px",
];

type Props = {
  screenId: string;
  onDone: () => void;
};

export function LiveEditToolbar({ screenId, onDone }: Props) {
  const [selState, setSelState] = useState<IframeSelectionState | null>(null);
  const foreRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "__ptu_selection_state") {
        setSelState(e.data.state as IframeSelectionState);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const cmd = useCallback(
    (command: string, value?: string) => {
      sendFormatCommand(screenId, command, value);
    },
    [screenId],
  );

  const parsedFontSize = selState?.fontSize
    ? selState.fontSize.replace(/[^0-9.]/g, "")
    : "";

  const currentFont = selState?.fontName
    ? selState.fontName.split(",")[0].replace(/['"]/g, "").trim()
    : "";

  const btnBase =
    "flex items-center justify-center size-8 rounded-md transition-all duration-100 ";
  const btnNormal = btnBase + "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800";
  const btnActive = btnBase + "bg-indigo-100 text-indigo-700";

  return (
    <div
      className="flex items-center gap-0.5 rounded-2xl border border-green-200 bg-white px-2 py-1 shadow-2xl shadow-green-300/30 max-w-[calc(100vw-16px)] overflow-x-auto"
      style={{ scrollbarWidth: "none" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Undo / Redo */}
      <ToolBtn icon={<Undo2 className="size-3.5" />} title="Undo" onClick={() => cmd("undo")} />
      <ToolBtn icon={<Redo2 className="size-3.5" />} title="Redo" onClick={() => cmd("redo")} />

      <Sep />

      {/* Font Family */}
      <select
        value={FONT_FAMILIES.some((f) => f.value === currentFont) ? currentFont : ""}
        onChange={(e) => {
          if (e.target.value) cmd("fontName", e.target.value);
        }}
        className="h-8 max-w-[130px] cursor-pointer truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-700 outline-none hover:bg-zinc-100"
        title="Font family"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font Size */}
      <select
        value={
          FONT_SIZES.includes(parsedFontSize + "px") ? parsedFontSize + "px" : ""
        }
        onChange={(e) => {
          if (e.target.value) cmd("fontSize", e.target.value);
        }}
        className="h-8 w-[60px] cursor-pointer rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-[11px] font-medium text-zinc-700 outline-none hover:bg-zinc-100"
        title="Font size"
      >
        <option value="">{parsedFontSize ? `${parsedFontSize}px` : "Size"}</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <Sep />

      {/* Text formatting */}
      <button
        type="button"
        className={selState?.bold ? btnActive : btnNormal}
        title="Bold"
        onClick={() => cmd("bold")}
      >
        <Bold className="size-3.5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={selState?.italic ? btnActive : btnNormal}
        title="Italic"
        onClick={() => cmd("italic")}
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        className={selState?.underline ? btnActive : btnNormal}
        title="Underline"
        onClick={() => cmd("underline")}
      >
        <Underline className="size-3.5" />
      </button>
      <button
        type="button"
        className={selState?.strikeThrough ? btnActive : btnNormal}
        title="Strikethrough"
        onClick={() => cmd("strikeThrough")}
      >
        <Strikethrough className="size-3.5" />
      </button>

      <Sep />

      {/* Colors */}
      <div className="relative" title="Text color">
        <button
          type="button"
          className={btnNormal}
          onClick={() => foreRef.current?.click()}
        >
          <span
            className="text-[13px] font-bold leading-none"
            style={{ color: selState?.foreColor || "#000000" }}
          >
            A
          </span>
          <span
            className="absolute bottom-1 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full"
            style={{ background: selState?.foreColor || "#000000" }}
          />
        </button>
        <input
          ref={foreRef}
          type="color"
          className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
          value={normalizeColor(selState?.foreColor) || "#000000"}
          onChange={(e) => cmd("foreColor", e.target.value)}
        />
      </div>
      <div className="relative" title="Background color">
        <button
          type="button"
          className={btnNormal}
          onClick={() => bgRef.current?.click()}
        >
          <span className="flex size-4 items-center justify-center rounded border border-zinc-300 text-[10px] font-bold leading-none"
            style={{ background: normalizeColor(selState?.backColor) || "#ffffff" }}
          >
            &nbsp;
          </span>
        </button>
        <input
          ref={bgRef}
          type="color"
          className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
          value={normalizeColor(selState?.backColor) || "#ffffff"}
          onChange={(e) => cmd("backColor", e.target.value)}
        />
      </div>

      <Sep />

      {/* Alignment */}
      <button
        type="button"
        className={selState?.justifyLeft ? btnActive : btnNormal}
        title="Align left"
        onClick={() => cmd("justifyLeft")}
      >
        <AlignLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className={selState?.justifyCenter ? btnActive : btnNormal}
        title="Align center"
        onClick={() => cmd("justifyCenter")}
      >
        <AlignCenter className="size-3.5" />
      </button>
      <button
        type="button"
        className={selState?.justifyRight ? btnActive : btnNormal}
        title="Align right"
        onClick={() => cmd("justifyRight")}
      >
        <AlignRight className="size-3.5" />
      </button>

      <Sep />

      {/* Lists */}
      <ToolBtn icon={<List className="size-3.5" />} title="Bullet list" onClick={() => cmd("insertUnorderedList")} />
      <ToolBtn icon={<ListOrdered className="size-3.5" />} title="Numbered list" onClick={() => cmd("insertOrderedList")} />

      <Sep />

      {/* Clear */}
      <ToolBtn icon={<RemoveFormatting className="size-3.5" />} title="Clear formatting" onClick={() => cmd("removeFormat")} />

      <Sep />

      {/* Done */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDone(); }}
        className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-green-600"
      >
        <Check className="size-3.5" />
        Done
      </button>
    </div>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px bg-zinc-200" />;
}

function ToolBtn({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className="flex size-8 items-center justify-center rounded-md text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-800"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {icon}
    </button>
  );
}

function normalizeColor(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("#")) return raw;
  const m = raw.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) {
    const hex = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }
  return raw;
}
