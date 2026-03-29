/** Keys used when carrying a brief from the marketing home (signed-in only). */

export const WELCOME_PROMPT_KEY = "studio_welcome_prompt";
export const WELCOME_SURFACE_KEY = "studio_welcome_surface";
export const WELCOME_MODEL_KEY = "studio_welcome_model";
export const WELCOME_THINKING_KEY = "studio_welcome_thinking";
export const WELCOME_REFERENCE_URLS_KEY = "studio_welcome_reference_urls";

export function clearWelcomeSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WELCOME_PROMPT_KEY);
    sessionStorage.removeItem(WELCOME_SURFACE_KEY);
    sessionStorage.removeItem(WELCOME_MODEL_KEY);
    sessionStorage.removeItem(WELCOME_THINKING_KEY);
    sessionStorage.removeItem(WELCOME_REFERENCE_URLS_KEY);
  } catch {
    /* ignore */
  }
}
