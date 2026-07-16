import { StyleSheet, useWindowDimensions } from "react-native";

// Shared responsive layout helpers.
//
// Phone-first screens stretch their cards/rows edge-to-edge, which looks wrong
// on desktop/web. `wide.content` caps the scrollable content at a comfortable
// reading width and centers it — on narrow screens maxWidth never kicks in, so
// it is safe to apply unconditionally to any ScrollView/FlatList
// contentContainerStyle.
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

/** Maximum width for single-column card/list content. */
export const CONTENT_MAX_WIDTH = 760;

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
  /** Cap + center scroll content. Spread into contentContainerStyle arrays. */
  content: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  /** Same cap for non-scroll header/footer bars that should track the content. */
  bar: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
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
