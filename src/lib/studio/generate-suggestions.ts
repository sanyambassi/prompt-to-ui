import type { UISchema } from "@/lib/schema/types";

type NodeTypeCount = Record<string, number>;

function countNodeTypes(
  schema: UISchema,
  counts: NodeTypeCount = {},
): NodeTypeCount {
  const t = schema.type?.toLowerCase() ?? "unknown";
  counts[t] = (counts[t] ?? 0) + 1;
  if (schema.children) {
    for (const child of schema.children) countNodeTypes(child, counts);
  }
  return counts;
}

function hasNodeType(schema: UISchema, type: string): boolean {
  if (schema.type === type) return true;
  return schema.children?.some((c) => hasNodeType(c, type)) ?? false;
}

/**
 * Generate contextual follow-up suggestions based on a generated UISchema.
 * Returns 3-5 actionable prompt suggestions.
 */
export function generateSuggestions(
  schemas: { name: string; ui_schema: UISchema }[],
  originalPrompt: string,
): string[] {
  if (schemas.length === 0) return [];

  const mainSchema = schemas[0].ui_schema;
  const counts = countNodeTypes(mainSchema);
  const suggestions: string[] = [];
  const promptLower = originalPrompt.toLowerCase();

  const hasImages = (counts["image"] ?? 0) > 0;
  const hasHero = hasNodeType(mainSchema, "hero");
  const hasForm = hasNodeType(mainSchema, "form");
  const hasCards = (counts["card"] ?? 0) + (counts["feature-card"] ?? 0) + (counts["pricing-card"] ?? 0) > 0;
  const hasFooter = hasNodeType(mainSchema, "footer");

  if (promptLower.includes("product") || promptLower.includes("shoe") || promptLower.includes("sneaker")) {
    suggestions.push("Add a product gallery with multiple angles");
    suggestions.push("Create a checkout flow for this product");
    suggestions.push("Design marketing materials for social media");
    if (!hasForm) suggestions.push("Add a review/rating section");
  }

  if (promptLower.includes("landing") || promptLower.includes("homepage")) {
    if (!hasNodeType(mainSchema, "testimonial")) suggestions.push("Add a testimonials section with real quotes");
    if (!hasCards) suggestions.push("Add feature cards with icons and descriptions");
    suggestions.push("Create a pricing page");
    if (schemas.length === 1) suggestions.push("Add a signup/login flow");
  }

  if (promptLower.includes("dashboard") || promptLower.includes("admin")) {
    suggestions.push("Add data visualization charts");
    suggestions.push("Create a settings page");
    suggestions.push("Add a user profile screen");
  }

  if (promptLower.includes("app") || promptLower.includes("mobile")) {
    if (schemas.length === 1) suggestions.push("Design the onboarding flow (3 screens)");
    suggestions.push("Create a profile/settings screen");
    suggestions.push("Add a notification center");
  }

  if (!hasHero && !promptLower.includes("dashboard")) {
    suggestions.push("Add a stunning hero section with a background image");
  }
  if (!hasFooter) {
    suggestions.push("Add a footer with links and social icons");
  }
  if (!hasImages) {
    suggestions.push("Add product images and visual elements");
  }
  if (hasImages && !promptLower.includes("product")) {
    suggestions.push("Generate a product page for the featured item");
  }

  suggestions.push("Make it more visually bold — add gradients and animations");
  suggestions.push("Create a dark mode variant");
  suggestions.push("Design the mobile responsive version");

  const unique = [...new Set(suggestions)];
  return unique.slice(0, 5);
}
