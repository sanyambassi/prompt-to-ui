import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safe internal redirect path (prevents open redirects).
 * Only allows same-origin relative paths.
 */
export function sanitizeRedirectPath(
  value: string | null,
  fallback = "/",
): string {
  if (
    !value ||
    value === "/" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes(":\\")
  ) {
    return fallback;
  }
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
