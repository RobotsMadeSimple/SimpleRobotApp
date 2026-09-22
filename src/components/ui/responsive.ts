import { StyleSheet, useWindowDimensions } from "react-native";

// Shared responsive layout helpers.
//
// Phone-first screens stretch their cards/rows edge-to-edge. On desktop/web the
// window can be far wider than that, so single-column content fills the width
// with a fixed side gutter instead — use `useWideContent()` in a ScrollView/
// FlatList contentContainerStyle (or a header/footer bar that should track it).
// The hook returns full-width-with-padding on wide screens and a no-op on phones,
// and being a hook it reflows when a desktop/web window is resized.
//
// Two-pane screens (builder, vision editor, inspection config) have three
// tiers driven by usePaneLayout():
//   "single"  — phones: one column, panes stacked.
//   "split"   — foldables / tablets / landscape phones (660–1100dp): 50/50
//               panes so the divider lands on a foldable's hinge.
//   "desktop" — ≥1100dp: fixed-width info pane, capped editor content.

/** Width at which two-pane layouts switch to a 50/50 split (unfolded
 *  foldables report ~670–840dp; the largest phones in portrait stay under). */
export const SPLIT_BREAKPOINT = 660;

/** Width at which two-pane layouts use a fixed sidebar instead of 50/50. */
export const DESKTOP_BREAKPOINT = 1100;

/** Maximum width for single-column card/list content. Kept for the narrow no-op only. */
export const CONTENT_MAX_WIDTH = 760;

/** Side gutter left on each edge when single-column content goes full-width on wide screens. */
export const WIDE_CONTENT_PADDING = 28;

export type PaneLayout = "single" | "split" | "desktop";

export function usePaneLayout(): PaneLayout {
  const { width } = useWindowDimensions();
  if (width >= DESKTOP_BREAKPOINT) return "desktop";
  if (width >= SPLIT_BREAKPOINT) return "split";
  return "single";
}

/** True when the window is wide enough for side-by-side pane layouts. */
export function useIsWide(): boolean {
  return usePaneLayout() !== "single";
}

export const wide = StyleSheet.create({
  /** Narrow no-op: on phones maxWidth never binds, so this leaves layout untouched. */
  content: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  /** Wide screens: fill the width, leaving a gutter on each side. The paddingHorizontal
   *  here overrides whatever the call site's own container padding was, so every wide
   *  screen ends up with the same side gutter and headers line up with their lists. */
  contentFull: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: WIDE_CONTENT_PADDING,
  },
  /** Override for a fixed-width left pane in "split" mode: equal 50/50 halves
   *  regardless of content, so the divider sits on a foldable's hinge. */
  paneSplit: {
    width: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
});

/**
 * The style to spread into a single-column ScrollView/FlatList `contentContainerStyle`
 * (or a header/footer bar tracking it). Full-width-with-gutter on wide screens, a no-op
 * cap on phones. A hook so a desktop/web window resize reflows it; call it once at the
 * top of the component, above any early return, and reuse the value.
 */
export function useWideContent() {
  return useIsWide() ? wide.contentFull : wide.content;
}
