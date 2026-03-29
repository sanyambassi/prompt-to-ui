export type ColorScheme = {
  id: string;
  name: string;
  description: string;
  mode: "light" | "dark";
  colors: {
    primary: string;
    onPrimary: string;
    secondary: string;
    surface: string;
    surfaceContainer: string;
    onSurface: string;
    onSurfaceVariant: string;
    accent: string;
    outlineVariant: string;
  };
  fonts: {
    headline: string;
    body: string;
  };
  preview: string[];
};

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: "midnight-studio",
    name: "Midnight Studio",
    description: "Deep navy & electric blue, crisp and technical",
    mode: "dark",
    colors: {
      primary: "#3B82F6",
      onPrimary: "#FFFFFF",
      secondary: "#1E3A5F",
      surface: "#0F172A",
      surfaceContainer: "#1E293B",
      onSurface: "#E2E8F0",
      onSurfaceVariant: "#94A3B8",
      accent: "#38BDF8",
      outlineVariant: "#334155",
    },
    fonts: { headline: "Space Grotesk", body: "Inter" },
    preview: ["#0F172A", "#3B82F6", "#38BDF8", "#E2E8F0"],
  },
  {
    id: "warm-editorial",
    name: "Warm Editorial",
    description: "Cream & terracotta, refined and inviting",
    mode: "light",
    colors: {
      primary: "#C2410C",
      onPrimary: "#FFFFFF",
      secondary: "#92400E",
      surface: "#FFFBEB",
      surfaceContainer: "#FEF3C7",
      onSurface: "#1C1917",
      onSurfaceVariant: "#57534E",
      accent: "#D97706",
      outlineVariant: "#E7E5E4",
    },
    fonts: { headline: "Playfair Display", body: "Source Sans 3" },
    preview: ["#FFFBEB", "#C2410C", "#D97706", "#1C1917"],
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    description: "Black canvas with electric neon accents",
    mode: "dark",
    colors: {
      primary: "#A855F7",
      onPrimary: "#FFFFFF",
      secondary: "#6D28D9",
      surface: "#09090B",
      surfaceContainer: "#18181B",
      onSurface: "#FAFAFA",
      onSurfaceVariant: "#A1A1AA",
      accent: "#F0ABFC",
      outlineVariant: "#27272A",
    },
    fonts: { headline: "Outfit", body: "DM Sans" },
    preview: ["#09090B", "#A855F7", "#F0ABFC", "#FAFAFA"],
  },
  {
    id: "ocean-calm",
    name: "Ocean Calm",
    description: "Teal & sand, peaceful and approachable",
    mode: "light",
    colors: {
      primary: "#0D9488",
      onPrimary: "#FFFFFF",
      secondary: "#115E59",
      surface: "#F0FDFA",
      surfaceContainer: "#CCFBF1",
      onSurface: "#134E4A",
      onSurfaceVariant: "#5F7570",
      accent: "#2DD4BF",
      outlineVariant: "#D1D5DB",
    },
    fonts: { headline: "Plus Jakarta Sans", body: "Nunito" },
    preview: ["#F0FDFA", "#0D9488", "#2DD4BF", "#134E4A"],
  },
  {
    id: "sunset-gradient",
    name: "Sunset Gradient",
    description: "Warm orange to rose, vibrant and energetic",
    mode: "light",
    colors: {
      primary: "#EA580C",
      onPrimary: "#FFFFFF",
      secondary: "#BE123C",
      surface: "#FFF7ED",
      surfaceContainer: "#FFEDD5",
      onSurface: "#1C1917",
      onSurfaceVariant: "#78716C",
      accent: "#FB923C",
      outlineVariant: "#FED7AA",
    },
    fonts: { headline: "Sora", body: "Inter" },
    preview: ["#FFF7ED", "#EA580C", "#BE123C", "#FB923C"],
  },
  {
    id: "monochrome-ink",
    name: "Monochrome Ink",
    description: "Grayscale with a single bold accent",
    mode: "light",
    colors: {
      primary: "#18181B",
      onPrimary: "#FFFFFF",
      secondary: "#3F3F46",
      surface: "#FAFAFA",
      surfaceContainer: "#F4F4F5",
      onSurface: "#09090B",
      onSurfaceVariant: "#71717A",
      accent: "#DC2626",
      outlineVariant: "#E4E4E7",
    },
    fonts: { headline: "Instrument Serif", body: "Inter" },
    preview: ["#FAFAFA", "#18181B", "#DC2626", "#71717A"],
  },
  {
    id: "forest-copper",
    name: "Forest & Copper",
    description: "Earthy greens with warm metallic accent",
    mode: "light",
    colors: {
      primary: "#166534",
      onPrimary: "#FFFFFF",
      secondary: "#14532D",
      surface: "#F0FDF4",
      surfaceContainer: "#DCFCE7",
      onSurface: "#14532D",
      onSurfaceVariant: "#4D7C5A",
      accent: "#B45309",
      outlineVariant: "#D1D5DB",
    },
    fonts: { headline: "Lora", body: "Karla" },
    preview: ["#F0FDF4", "#166534", "#B45309", "#14532D"],
  },
  {
    id: "candy-pop",
    name: "Candy Pop",
    description: "Playful pastels with bold primary punches",
    mode: "light",
    colors: {
      primary: "#DB2777",
      onPrimary: "#FFFFFF",
      secondary: "#7C3AED",
      surface: "#FDF2F8",
      surfaceContainer: "#FCE7F3",
      onSurface: "#1E1B4B",
      onSurfaceVariant: "#6B7280",
      accent: "#F472B6",
      outlineVariant: "#E9D5FF",
    },
    fonts: { headline: "Fredoka", body: "Quicksand" },
    preview: ["#FDF2F8", "#DB2777", "#7C3AED", "#F472B6"],
  },
  {
    id: "corporate-trust",
    name: "Corporate Trust",
    description: "Navy & white, clean and professional",
    mode: "light",
    colors: {
      primary: "#1E40AF",
      onPrimary: "#FFFFFF",
      secondary: "#1E3A8A",
      surface: "#FFFFFF",
      surfaceContainer: "#F1F5F9",
      onSurface: "#0F172A",
      onSurfaceVariant: "#475569",
      accent: "#3B82F6",
      outlineVariant: "#CBD5E1",
    },
    fonts: { headline: "Manrope", body: "Inter" },
    preview: ["#FFFFFF", "#1E40AF", "#3B82F6", "#0F172A"],
  },
  {
    id: "brutalist-raw",
    name: "Brutalist Raw",
    description: "Off-white & black, stark and unapologetic",
    mode: "light",
    colors: {
      primary: "#000000",
      onPrimary: "#FFFFFF",
      secondary: "#1A1A1A",
      surface: "#F5F5F0",
      surfaceContainer: "#EBEBDF",
      onSurface: "#000000",
      onSurfaceVariant: "#525252",
      accent: "#EF4444",
      outlineVariant: "#D4D4D4",
    },
    fonts: { headline: "Space Mono", body: "JetBrains Mono" },
    preview: ["#F5F5F0", "#000000", "#EF4444", "#525252"],
  },
  {
    id: "thales",
    name: "Thales",
    description: "Official Thales brand — dark blue, light blue, purple",
    mode: "light",
    colors: {
      primary: "#242A75",
      onPrimary: "#FFFFFF",
      secondary: "#7C7FAB",
      surface: "#F7F8FC",
      surfaceContainer: "#ECF0F6",
      onSurface: "#242A75",
      onSurfaceVariant: "#7C7FAB",
      accent: "#00BBDD",
      outlineVariant: "#C8CCE0",
    },
    fonts: { headline: "IBM Plex Sans", body: "Noto Sans" },
    preview: ["#242A75", "#00BBDD", "#7C7FAB"],
  },
];
