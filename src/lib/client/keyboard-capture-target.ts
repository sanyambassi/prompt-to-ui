/**
 * Returns true when the user is typing in a field where global workspace
 * shortcuts (e.g. Space-to-pan) must not run.
 */
export function isKeyboardCaptureTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.closest("[data-slot=select-trigger]")) return true;
  if (target.closest('[role="combobox"]')) return true;
  if (target.closest('[role="listbox"]')) return true;
  if (target.closest('[role="menu"]')) return true;
  if (target.closest('[role="textbox"]')) return true;
  return false;
}
