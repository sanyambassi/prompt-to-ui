import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { UISchemaLayout } from "./types";

const spacingMap: Record<number, string> = {
  0: "0",
  4: "1",
  8: "2",
  12: "3",
  16: "4",
  24: "6",
  32: "8",
};

function spacingToTw(prefix: string, n: number): string | undefined {
  const step = spacingMap[n];
  if (step !== undefined) return `${prefix}-${step}`;
  return undefined;
}

/** Values that should map to inline CSS (Tailwind safelist won’t include arbitrary model colors). */
/** Maps design-system roles to next/font CSS variables (layout.tsx). */
function studioFontFamilyToken(value: string): string | undefined {
  const k = value.trim().toLowerCase();
  const map: Record<string, string> = {
    headline:
      "var(--font-studio-display), ui-sans-serif, system-ui, sans-serif",
    display:
      "var(--font-studio-display), ui-sans-serif, system-ui, sans-serif",
    title:
      "var(--font-studio-display), ui-sans-serif, system-ui, sans-serif",
    body: "var(--font-studio-body), ui-sans-serif, system-ui, sans-serif",
    label: "var(--font-studio-body), ui-sans-serif, system-ui, sans-serif",
    sans: "var(--font-studio-body), ui-sans-serif, system-ui, sans-serif",
  };
  if (map[k]) return map[k];
  if (/url\s*\(|javascript:/i.test(value)) return undefined;
  return value.trim();
}

function colorToInline(value: string): string | undefined {
  const v = value.trim();
  if (
    v.startsWith("#") ||
    v.startsWith("rgb") ||
    v.startsWith("hsl") ||
    v.startsWith("oklch") ||
    v.startsWith("lch") ||
    v.startsWith("color(")
  ) {
    return v;
  }
  return undefined;
}

/**
 * Maps a small style vocabulary + optional `className` to Tailwind / inline style.
 */
export function styleToProps(style: Record<string, unknown> | undefined): {
  className: string;
  style?: CSSProperties;
} {
  if (!style) return { className: "" };

  const classes: string[] = [];
  const inline: CSSProperties = {};

  if (typeof style.className === "string" && style.className.trim()) {
    classes.push(style.className);
  }

  if (typeof style.bg === "string") {
    const c = colorToInline(style.bg);
    if (c) {
      inline.backgroundColor = c;
    } else {
      classes.push(`bg-${style.bg}`);
    }
  }

  if (typeof style.background === "string") {
    const v = style.background.trim();
    if (v.includes("gradient")) {
      inline.background = v;
    } else if (v.includes("url(") && !v.toLowerCase().includes("javascript:")) {
      inline.background = v;
    } else {
      const c = colorToInline(v);
      if (c) inline.backgroundColor = c;
    }
  }

  if (typeof style.backgroundColor === "string") {
    const c = colorToInline(style.backgroundColor);
    if (c) inline.backgroundColor = c;
  }

  if (typeof style.textColor === "string") {
    const c = colorToInline(style.textColor);
    if (c) {
      inline.color = c;
    } else {
      classes.push(`text-${style.textColor}`);
    }
  }

  if (typeof style.color === "string") {
    const c = colorToInline(style.color);
    if (c) inline.color = c;
  }

  if (typeof style.borderColor === "string") {
    const c = colorToInline(style.borderColor);
    if (c) inline.borderColor = c;
  }

  if (typeof style.fontSize === "string") {
    classes.push(`text-${style.fontSize}`);
  } else if (typeof style.fontSize === "number") {
    inline.fontSize = style.fontSize;
  }
  if (typeof style.fontWeight === "string") {
    classes.push(`font-${style.fontWeight}`);
  } else if (typeof style.fontWeight === "number") {
    inline.fontWeight = style.fontWeight;
  }

  if (typeof style.fontFamily === "string") {
    const mapped = studioFontFamilyToken(style.fontFamily);
    if (mapped) inline.fontFamily = mapped;
  }

  if (typeof style.padding === "number") {
    inline.padding = style.padding;
  } else if (typeof style.padding === "string") {
    inline.padding = style.padding;
  }
  if (typeof style.margin === "number") {
    inline.margin = style.margin;
  } else if (typeof style.margin === "string") {
    inline.margin = style.margin;
  }
  if (typeof style.paddingTop === "number") inline.paddingTop = style.paddingTop;
  if (typeof style.paddingBottom === "number") inline.paddingBottom = style.paddingBottom;
  if (typeof style.paddingLeft === "number") inline.paddingLeft = style.paddingLeft;
  if (typeof style.paddingRight === "number") inline.paddingRight = style.paddingRight;
  if (typeof style.marginTop === "number") inline.marginTop = style.marginTop;
  if (typeof style.marginBottom === "number") inline.marginBottom = style.marginBottom;

  for (const key of [
    "p",
    "px",
    "py",
    "pt",
    "pb",
    "pl",
    "pr",
    "m",
    "mx",
    "my",
  ] as const) {
    const v = style[key];
    if (typeof v === "number") {
      const tw = spacingToTw(key, v);
      if (tw) {
        classes.push(tw);
      } else {
        const cssProp = key === "p" ? "padding" : key === "m" ? "margin"
          : key === "px" ? "paddingInline" : key === "py" ? "paddingBlock"
          : key === "mx" ? "marginInline" : key === "my" ? "marginBlock"
          : key === "pt" ? "paddingTop" : key === "pb" ? "paddingBottom"
          : key === "pl" ? "paddingLeft" : key === "pr" ? "paddingRight"
          : undefined;
        if (cssProp) (inline as Record<string, unknown>)[cssProp] = v;
      }
    }
  }

  if (typeof style.borderRadius === "number") {
    inline.borderRadius = style.borderRadius;
  } else if (typeof style.borderRadius === "string") {
    inline.borderRadius = style.borderRadius;
  }
  if (typeof style.rounded === "string") {
    classes.push(`rounded-${style.rounded}`);
  } else if (typeof style.rounded === "number") {
    inline.borderRadius = style.rounded;
  }

  if (style.shadow === true || style.shadow === "sm") {
    classes.push("shadow-sm");
  } else if (style.shadow === "md") {
    classes.push("shadow-md");
  } else if (style.shadow === "lg") {
    classes.push("shadow-lg");
  }

  if (typeof style.width === "string") {
    if (style.width === "100%" || style.width === "auto" || style.width.endsWith("px") || style.width.endsWith("rem") || style.width.endsWith("vw")) {
      inline.width = style.width;
    } else {
      classes.push(style.width.startsWith("w-") ? style.width : `w-${style.width}`);
    }
  } else if (typeof style.width === "number") {
    inline.width = style.width;
  }
  if (typeof style.height === "string") {
    if (style.height === "100%" || style.height === "auto" || style.height.endsWith("px") || style.height.endsWith("rem") || style.height.endsWith("vh")) {
      inline.height = style.height;
    } else {
      classes.push(style.height.startsWith("h-") ? style.height : `h-${style.height}`);
    }
  } else if (typeof style.height === "number") {
    inline.height = style.height;
  }

  if (typeof style.border === "string") {
    classes.push("border", `border-${style.border}`);
  }

  if (typeof style.opacity === "number") {
    inline.opacity = style.opacity;
  }

  if (typeof style.objectFit === "string") {
    inline.objectFit = style.objectFit as CSSProperties["objectFit"];
  }
  if (typeof style.minHeight === "number") {
    inline.minHeight = style.minHeight;
  } else if (typeof style.minHeight === "string") {
    inline.minHeight = style.minHeight;
  }
  if (typeof style.maxWidth === "number") {
    inline.maxWidth = style.maxWidth;
  } else if (typeof style.maxWidth === "string") {
    inline.maxWidth = style.maxWidth;
  }
  if (typeof style.overflow === "string") {
    inline.overflow = style.overflow as CSSProperties["overflow"];
  }
  if (typeof style.gap === "number") {
    inline.gap = style.gap;
  }
  if (typeof style.lineHeight === "number" || typeof style.lineHeight === "string") {
    inline.lineHeight = style.lineHeight as CSSProperties["lineHeight"];
  }
  if (typeof style.letterSpacing === "number" || typeof style.letterSpacing === "string") {
    inline.letterSpacing = style.letterSpacing as CSSProperties["letterSpacing"];
  }
  if (typeof style.textAlign === "string") {
    inline.textAlign = style.textAlign as CSSProperties["textAlign"];
  }
  if (typeof style.display === "string") {
    inline.display = style.display as CSSProperties["display"];
  }
  if (typeof style.flexDirection === "string") {
    inline.flexDirection = style.flexDirection as CSSProperties["flexDirection"];
  }
  if (typeof style.justifyContent === "string") {
    inline.justifyContent = style.justifyContent as CSSProperties["justifyContent"];
  }
  if (typeof style.alignItems === "string") {
    inline.alignItems = style.alignItems as CSSProperties["alignItems"];
  }
  if (typeof style.position === "string") {
    inline.position = style.position as CSSProperties["position"];
  }

  if (typeof style.boxShadow === "string") {
    inline.boxShadow = style.boxShadow;
  }
  if (typeof style.backdropFilter === "string") {
    inline.backdropFilter = style.backdropFilter;
    (inline as Record<string, string>).WebkitBackdropFilter = style.backdropFilter;
  }
  if (typeof style.textShadow === "string") {
    inline.textShadow = style.textShadow;
  }
  if (typeof style.borderWidth === "number") {
    inline.borderWidth = style.borderWidth;
  } else if (typeof style.borderWidth === "string") {
    inline.borderWidth = style.borderWidth;
  }
  if (typeof style.borderStyle === "string") {
    inline.borderStyle = style.borderStyle as CSSProperties["borderStyle"];
  }
  if (typeof style.top === "number") inline.top = style.top;
  if (typeof style.right === "number") inline.right = style.right;
  if (typeof style.bottom === "number") inline.bottom = style.bottom;
  if (typeof style.left === "number") inline.left = style.left;
  if (typeof style.zIndex === "number") inline.zIndex = style.zIndex;

  const className = cn(classes.filter(Boolean));
  return {
    className,
    style: Object.keys(inline).length ? inline : undefined,
  };
}

export function layoutToClasses(
  layout: UISchemaLayout | undefined,
): { className: string; style?: CSSProperties } {
  if (!layout) return { className: "" };
  const gapTw =
    layout.gap != null
      ? (spacingToTw("gap", layout.gap) ?? `gap-[${layout.gap}px]`)
      : "";
  const padTw =
    layout.padding != null
      ? (spacingToTw("p", layout.padding) ?? `p-[${layout.padding}px]`)
      : "";

  switch (layout.mode) {
    case "stack":
    case "flex-column":
      return {
        className: cn("flex flex-col", gapTw, padTw),
      };
    case "flex-row":
      return {
        className: cn("flex flex-row flex-wrap items-start", gapTw, padTw),
      };
    case "grid": {
      const cols = layout.columns ?? 2;
      return {
        className: cn("grid", gapTw, padTw),
        style: {
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        },
      };
    }
    case "absolute":
      return { className: cn("relative", padTw) };
    default:
      return { className: cn(gapTw, padTw) };
  }
}
