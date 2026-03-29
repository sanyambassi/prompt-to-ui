export type PromptIntent = "image" | "webframe" | "both";

const WEB_KEYWORDS =
  /\b(website|web\s*page|dashboard|landing\s*page|app\s+ui|user\s*interface|saas|admin\s*panel|portal|sign[\s-]*up|login\s*page|checkout|navbar|sidebar|header|footer|form\s*layout|settings\s*page|profile\s*page|onboarding|pricing\s*page)\b/i;

const IMAGE_KEYWORDS =
  /\b(product|shoe|sneaker|render|concept\s*art|illustration|packaging|photo|scene|object|logo|icon|poster|mockup|3d|sketch|character|portrait|wallpaper|texture|pattern|infographic|banner|sticker|badge)\b/i;

export function classifyPrompt(prompt: string): PromptIntent {
  const isWeb = WEB_KEYWORDS.test(prompt);
  const isImage = IMAGE_KEYWORDS.test(prompt);

  if (isWeb && isImage) return "both";
  if (isWeb) return "webframe";
  return "image";
}
