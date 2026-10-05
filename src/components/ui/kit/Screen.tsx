import { ReactNode } from "react";
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { useWideContent } from "@/src/components/ui/responsive";
import { colors, spacing } from "./theme";

type Props = {
  children: ReactNode;
  /** false for screens that manage their own scrolling (FlatList, panes). Default true. */
  scroll?: boolean;
  /** Extra style for the content container (scroll) / inner view (non-scroll). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Remove default padding, e.g. for full-bleed pane layouts. */
  padded?: boolean;
};

/**
 * Standard page wrapper: gray app background, default padding, and the shared
 * wide-screen gutter (useWideContent) so every page's content lines up.
 *
 *   <Screen> ...cards... </Screen>            // scrolling page of cards
 *   <Screen scroll={false} padded={false}>    // screen with its own list/panes
 */
export function Screen({ children, scroll = true, contentStyle, padded = true }: Props) {
  const wideContent = useWideContent();

  if (!scroll) {
    return (
      <View style={styles.container}>
        <View style={[styles.fill, padded && styles.padded, wideContent, contentStyle]}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[padded && styles.padded, styles.scrollContent, wideContent, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  fill:          { flex: 1 },
  padded:        { padding: spacing.lg },
  scrollContent: { paddingBottom: spacing.xxl, gap: spacing.md },
});

