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
//   "split"   — foldables / tablets / landscape phones (660–1100dp, or ≥560dp
//               when short — see useIsShort): 50/50
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

/** Side gutter on short (landscape phone) screens, which have no width to spare beside the rail. */
export const SHORT_CONTENT_PADDING = 16;

/**
 * Height under which a landscape window is "short": a phone on its side (~360–430dp tall). Tablets,
 * foldables and desktop windows stay well above it. Short screens keep the wide layout (rail +
 * crumb bar) but compact it — icon rail, slim header, tighter gutters — and pages whose portrait
 * layout stacks vertically (the jog pad) switch to side-by-side.
 */
export const SHORT_BREAKPOINT = 500;

/** Narrowest short (landscape) window that still gets split panes (small phones on their side). */
const SHORT_SPLIT_MIN = 560;

export type PaneLayout = "single" | "split" | "desktop";

function isShortSize(width: number, height: number): boolean {
  return height < SHORT_BREAKPOINT && width > height;
}

export function usePaneLayout(): PaneLayout {
  const { width, height } = useWindowDimensions();
  if (width >= DESKTOP_BREAKPOINT) return "desktop";
  if (width >= SPLIT_BREAKPOINT) return "split";
  // A small phone on its side is still far too short for stacked panes.
  if (width >= SHORT_SPLIT_MIN && isShortSize(width, height)) return "split";
  return "single";
}

/** True when the window is wide enough for side-by-side pane layouts. */
export function useIsWide(): boolean {
  return usePaneLayout() !== "single";
}

/** True on a short landscape window (a phone on its side) — compact the chrome, go side-by-side. */
export function useIsShort(): boolean {
  const { width, height } = useWindowDimensions();
  return isShortSize(width, height);
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
  /** Short (landscape phone) variant: the same full width with a tighter gutter. */
  contentFullShort: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: SHORT_CONTENT_PADDING,
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
  const isWide = useIsWide();
  const isShort = useIsShort();
  if (!isWide) return wide.content;
  return isShort ? wide.contentFullShort : wide.contentFull;
}
