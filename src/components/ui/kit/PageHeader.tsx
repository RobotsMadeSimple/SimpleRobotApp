import { router, usePathname } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionStatus } from "@/src/components/ui/ConnectedStatus";
import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
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
   * Narrow-screen fallback target for the back affordance when there is no
   * navigation history (deep link). Defaults to the parent crumb's href.
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
  const insets = useSafeAreaInsets();
  const wideContent = useWideContent();
  const pathname = usePathname();

  const trail = crumbs ?? crumbsFromPath(pathname, title);
  const parent = trail.length > 1 ? trail[trail.length - 2] : undefined;

  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.navigate((backTo ?? parent?.href ?? "/") as never);
  };

  const goCrumb = (href: string) => {
    if (onNavigate) return onNavigate(href);
    router.navigate(href as never);
  };

  if (isWide) {
    return (
      <View>
        {/* Breadcrumbs live in a real header bar spanning the content pane. */}
        {trail.length > 1 && (
          <View style={styles.crumbBar}>
            <View style={[styles.crumbRow, wideContent]}>
              {trail.map((crumb, i) => {
                const last = i === trail.length - 1;
                return (
                  <View key={`${crumb.label}-${i}`} style={styles.crumbItem}>
                    {i > 0 && <Text style={styles.crumbSep}>›</Text>}
                    {last || !crumb.href ? (
                      <Text style={[styles.crumb, last && styles.crumbCurrent]} numberOfLines={1}>
                        {crumb.label}
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
          </View>
        )}
        <View style={[styles.wideWrap, wideContent]}>
          <View style={styles.wideTitleRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.wideTitle} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={[type.body, styles.wideSubtitle]} numberOfLines={2}>{subtitle}</Text>}
            </View>
            {right != null && <View style={styles.right}>{right}</View>}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.narrowBar, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.narrowRow}>
        {parent && (
          <Pressable style={styles.backBtn} onPress={goBack} hitSlop={10}>
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
    paddingVertical: spacing.sm + 2,
  },
  wideWrap: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  crumbRow:  { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  crumbItem: { flexDirection: "row", alignItems: "center" },
  crumbSep:  { color: colors.textFaint, fontSize: 14, marginHorizontal: spacing.xs + 2 },
  crumb:     { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  crumbHover:   { color: colors.accent },
  crumbCurrent: { color: colors.text, fontWeight: "600" },
  wideTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  titleBlock:   { flex: 1, minWidth: 0 },
  wideTitle:    { fontSize: 24, fontWeight: "700", color: colors.text },
  wideSubtitle: { marginTop: 2 },
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
