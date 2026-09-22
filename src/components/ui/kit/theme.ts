import { Platform, StyleSheet, TextStyle, ViewStyle } from "react-native";

// ── Design tokens ─────────────────────────────────────────────────────────────
//
// Single source of truth for the app's look: colors, spacing, radii, type and
// shadows. Screens and kit components read from these instead of hardcoding
// values, so a future dark mode only has to swap the `colors` object.
//
// The palette matches the app icon's friendly blue on the Tailwind gray scale
// the existing screens already use — this codifies the best pages, it does not
// invent a new look.

export const colors = {
  // Surfaces
  background:   "#f3f4f6", // page background behind cards
  surface:      "#ffffff", // cards, bars, sheets
  surfaceMuted: "#f9fafb", // inputs, wells, subtle fills inside cards
  surfaceHover: "#f3f4f6", // hover/pressed fill for white rows (web + long-press)

  // Lines
  border:       "#e5e7eb",
  borderStrong: "#d1d5db",

  // Text
  text:          "#111827",
  textSecondary: "#374151",
  textMuted:     "#6b7280",
  textFaint:     "#9ca3af",

  // Accent (brand blue, from the app icon)
  accent:       "#2563eb",
  accentBright: "#3b82f6",
  accentSoft:   "#eff6ff", // icon tiles, active pills
  accentBorder: "#bfdbfe", // dashed add-buttons, focused inputs
  accentFaded:  "#93c5fd", // disabled primary buttons

  // Status (base / pale fill / border tint matching the fill)
  success:       "#16a34a",
  successSoft:   "#f0fdf4",
  successBorder: "#bbf7d0",
  warning:       "#d97706",
  warningSoft:   "#fffbeb",
  warningBorder: "#fde68a",
  danger:        "#dc2626",
  dangerSoft:    "#fef2f2",
  dangerBorder:  "#fecaca",

  // Dark surfaces: toasts/snackbars and floating toolbars over camera feeds
  surfaceDark:   "#1f2937",
  onSurfaceDark: "#f9fafb",
  overlayDark:   "rgba(17,24,39,0.72)",

  // Misc
  onAccent: "#ffffff",           // text/icons on accent or danger fills
  overlay:  "rgba(0,0,0,0.45)",  // modal scrim
} as const;

/**
 * Secondary accent families for tints that carry meaning beside the brand blue
 * (variable/expression purple, vision/condition cyan, string/axis orange).
 * Same base / soft-fill / border-tint shape as the blue accent — use these
 * instead of per-file hex constants.
 */
export const accents = {
  purple:       "#7c3aed",
  purpleSoft:   "#f5f3ff",
  purpleBorder: "#ddd6fe",
  cyan:         "#0891b2",
  cyanSoft:     "#ecfeff",
  cyanBorder:   "#a5f3fc",
  orange:       "#ea580c",
  orangeSoft:   "#fff7ed",
  orangeBorder: "#fed7aa",
} as const;

/** 4-based spacing scale. Use these instead of magic padding/margins. */
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
} as const;

/** Corner radii. `md` for tiles/inputs/buttons, `lg` for cards, `xl` for modals. */
export const radii = {
  sm:   9,
  md:   12,
  lg:   14,
  xl:   20,
  pill: 999,
} as const;

const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Typography presets — spread into a Text style or use via `type.*`. */
export const type = StyleSheet.create({
  /** Large screen title (in-page, not the nav header). */
  pageTitle: { fontSize: 20, fontWeight: "700", color: colors.text } as TextStyle,
  /** Card / row title. */
  title: { fontSize: 15, fontWeight: "600", color: colors.text } as TextStyle,
  /** Uppercase micro-label above a section of cards. */
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } as TextStyle,
  /** Default body copy. */
  body: { fontSize: 14, color: colors.textSecondary } as TextStyle,
  /** Secondary line under a title. */
  subtitle: { fontSize: 12, color: colors.textFaint } as TextStyle,
  /** Small annotations, timestamps, helper text. */
  caption: { fontSize: 11, color: colors.textFaint } as TextStyle,
  /** Technical readouts: coordinates, IPs, serials. */
  mono: { fontSize: 13, fontFamily: monoFamily, color: colors.textSecondary } as TextStyle,
});

/** Cross-platform shadows (iOS shadow + Android elevation). */
export const shadows = StyleSheet.create({
  /** Cards and list rows. */
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  /** Modals, popovers, anything floating above the page. */
  raised: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  } as ViewStyle,
});

/** Everything in one object for `import { theme } from ".../kit"`. */
export const theme = { colors, accents, spacing, radii, type, shadows } as const;

