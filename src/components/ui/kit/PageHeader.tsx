import { router, usePathname } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionStatus } from "@/src/components/ui/ConnectedStatus";
import { useIsShort, useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { labelForSegment } from "./routeLabels";
import { colors, spacing, type } from "./theme";

export type Crumb = {
  label: string;
  /** Navigation target when tapped. The current page's crumb omits it. */
  href?: string;
};

type Props = {
  title: string;
  /** One-line description under the title — say what the page is for. */
  subtitle?: string;
  /** Action buttons (kit Button size="sm") on the right edge. */
  right?: ReactNode;
  /**
   * Breadcrumb trail INCLUDING the current page as the last entry.
   * Defaults to the route path (via ROUTE_LABELS); pass explicitly when the
   * logical hierarchy is deeper than the flat route (e.g. Vision › Zone Editor).
   */
  crumbs?: Crumb[];
  /**
   * Narrow-screen target for the back affordance. Defaults to the parent
   * crumb's href.
   */
  backTo?: string;
  /** Show the connection status on narrow screens (wide shows it in the rail). Default true. */
  connection?: boolean;
  /**
   * Guarded exit: replaces the narrow back affordance's default navigation.
   * Use on screens that must intercept leaving (unsaved-changes prompt,
   * commit-on-close). The handler owns navigation entirely.
   */
  onBack?: () => void;
  /**
   * Guarded crumb navigation: intercepts ancestor crumb taps on wide screens.
   * Receives the crumb's href; the handler owns navigation entirely. Pair with
   * onBack so both exits run the same guard.
   */
  onNavigate?: (href: string) => void;
};

/**
 * The app-wide page header. Every page renders one at the top, OUTSIDE the
 * scrolling Screen:
 *
 *   <View style={{ flex: 1, backgroundColor: colors.background }}>
 *     <PageHeader title="Configure" subtitle="Motion and homing settings" />
 *     <Screen> ... </Screen>
 *   </View>
 *
 * Wide screens: a breadcrumb trail (ancestors tappable) above a large title,
 * subtitle, and right-hand actions — no back arrow; the rail + crumbs are the
 * navigation. Narrow screens: a compact safe-area bar whose back affordance
 * names the parent ("‹ Program") instead of a bare arrow.
 */
export function PageHeader({ title, subtitle, right, crumbs, backTo, connection = true, onBack, onNavigate }: Props) {
  const isWide = useIsWide();
  const isShort = useIsShort();
  const insets = useSafeAreaInsets();
  const wideContent = useWideContent();
  const pathname = usePathname();

  const trail = crumbs ?? crumbsFromPath(pathname, title);
  const parent = trail.length > 1 ? trail[trail.length - 2] : undefined;

  // Back is absolute: it always lands on the parent page, never "one step back" in history (which
  // could be another tab or a page you came from sideways). dismissTo pops to the parent when it's
  // already under this page, else replaces this page with it.
  const goBack = () => {
    if (onBack) return onBack();
    router.dismissTo((backTo ?? parent?.href ?? "/") as never);
  };

  const goCrumb = (href: string) => {
    if (onNavigate) return onNavigate(href);
    router.navigate(href as never);
  };

  if (isWide) {
    // One slim bar spanning the content pane: the breadcrumb trail ends in the page title, the
    // subtitle follows it as a quiet one-liner, and the page's actions sit on the right. (There is
    // no separate big title block — the trail already names the page.) Always rendered, so a landing
    // page shows its own name as the single crumb and the bar is a landmark on every wide screen.
    return (
      // Pad past the status bar: the app draws edge-to-edge, so without the top inset the crumb
      // bar renders under the status bar and the system intercepts taps on the breadcrumbs.
      // Short (landscape phone) screens get a slimmer bar: height is the scarce axis there.
      <View style={[styles.crumbBar, isShort && styles.crumbBarShort, { paddingTop: insets.top + (isShort ? spacing.sm : spacing.md + 2) }]}>
        <View style={[styles.wideBarRow, wideContent]}>
          <View style={styles.wideLead}>
            <View style={styles.crumbRow}>
              {trail.map((crumb, i) => {
                const last = i === trail.length - 1;
                return (
                  <View key={`${crumb.label}-${i}`} style={[styles.crumbItem, last && styles.crumbItemLast]}>
                    {i > 0 && <Text style={styles.crumbSep}>›</Text>}
                    {last || !crumb.href ? (
                      <Text style={[styles.crumb, last && styles.crumbCurrent]} numberOfLines={1}>
                        {last ? title : crumb.label}
                      </Text>
                    ) : (
                      <Pressable onPress={() => goCrumb(crumb.href!)} hitSlop={6}>
                        {({ hovered }: { hovered?: boolean }) => (
                          <Text style={[styles.crumb, hovered && styles.crumbHover]} numberOfLines={1}>
                            {crumb.label}
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
            {!!subtitle && <Text style={[type.caption, styles.wideSubtitle]} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {right != null && <View style={styles.right}>{right}</View>}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.narrowBar, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.narrowRow}>
        {parent && (
          <Pressable style={styles.backBtn} onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={20} color={colors.accent} />
            <Text style={styles.backLabel} numberOfLines={1}>{parent.label}</Text>
          </Pressable>
        )}
        <View style={styles.narrowTitleBlock}>
          <Text style={type.pageTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={type.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right != null ? <View style={styles.right}>{right}</View> : connection ? <ConnectionStatus /> : null}
      </View>
    </View>
  );
}

/** "/program/vision-editor" → [{Program, href:/program}, {<title>}] */
function crumbsFromPath(pathname: string, title: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean).filter(s => !s.startsWith("("));
  if (segments.length === 0) return [{ label: title }];
  const ancestors = segments.slice(0, -1).map((seg, i) => ({
    label: labelForSegment(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));
  return [...ancestors, { label: title }];
}

const styles = StyleSheet.create({
  // Wide: breadcrumbs sit in a slim surface header bar spanning the content
  // pane; the title block below breathes with extra top spacing.
  crumbBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md + 2,
  },
  crumbBarShort: { paddingVertical: spacing.sm },
  wideBarRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, minHeight: 36 },
  wideLead:   { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: spacing.md },
  crumbRow:  { flexDirection: "row", alignItems: "center", flexShrink: 0, maxWidth: "70%" },
  crumbItem: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  crumbItemLast: { flexShrink: 1, minWidth: 0 },
  crumbSep:  { color: colors.textFaint, fontSize: 16, marginHorizontal: spacing.sm },
  crumb:     { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  crumbHover:   { color: colors.accent },
  crumbCurrent: { color: colors.text, fontSize: 18, fontWeight: "700" },
  wideSubtitle: { flex: 1, minWidth: 0 },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  // Narrow: a real mobile header bar with safe-area padding.
  narrowBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
  },
  narrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
    maxWidth: 130,
  },
  backLabel: { color: colors.accent, fontSize: 14, fontWeight: "600", marginLeft: -2 },
  narrowTitleBlock: { flex: 1, minWidth: 0 },
});
