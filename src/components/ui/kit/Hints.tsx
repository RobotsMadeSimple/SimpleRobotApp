import { Info, X } from "lucide-react-native";
import { ReactNode, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";

import { colors, radii, shadows, spacing, type } from "./theme";

// ── HintBanner ────────────────────────────────────────────────────────────────

/** Dismissals last for the app session only (module memory, not persisted). */
const dismissedHints = new Set<string>();

type HintBannerProps = {
  /** Stable id so a dismissed hint stays hidden for the rest of the session. */
  id: string;
  children: ReactNode | string;
  /** Optional trailing action ("Open docs", "Show me"). */
  action?: { label: string; onPress: () => void };
  /** false to hide the ✕ (always-on guidance). Default true. */
  dismissible?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Inline helper strip that explains a non-obvious page or feature:
 *
 *   <HintBanner id="vision-zones">
 *     Draw zones on the camera feed, then attach inspections to each zone.
 *   </HintBanner>
 */
export function HintBanner({ id, children, action, dismissible = true, style }: HintBannerProps) {
  const [, force] = useState(0);
  if (dismissedHints.has(id)) return null;

  return (
    <View style={[styles.banner, style]}>
      <Info size={16} color={colors.accent} style={styles.bannerIcon} />
      <Text style={[type.body, styles.bannerText]}>{children}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.bannerAction}>{action.label}</Text>
        </Pressable>
      )}
      {dismissible && (
        <Pressable
          onPress={() => { dismissedHints.add(id); force(n => n + 1); }}
          hitSlop={10}
          accessibilityLabel="Dismiss hint"
        >
          <X size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

// ── InfoTip ───────────────────────────────────────────────────────────────────

const TIP_MAX_WIDTH = 260;

type InfoTipProps = {
  /** Short plain-text explanation (one to three sentences). */
  text: string;
  /** Icon size; 14 fits inline beside labels. */
  size?: number;
};

/**
 * A small ⓘ that reveals a short explanation in a floating bubble anchored to
 * the icon (press-outside to close). Place beside labels, section headers,
 * and settings whose meaning isn't obvious:
 *
 *   <SectionHeader title="Soft limits" right={<InfoTip text="…" />} />
 */
export function InfoTip({ text, size = 14 }: InfoTipProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const left = Math.min(Math.max(spacing.sm, x + w / 2 - TIP_MAX_WIDTH / 2),
                            windowWidth - TIP_MAX_WIDTH - spacing.sm);
      setAnchor({ x: left, y: y + h + spacing.xs });
    });
  };

  return (
    <>
      <Pressable ref={triggerRef} onPress={open} hitSlop={10} accessibilityLabel="More info">
        <Info size={size} color={colors.textFaint} />
      </Pressable>
      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)}>
          {anchor && (
            <View style={[styles.tipBubble, shadows.raised, { left: anchor.x, top: anchor.y }]}>
              <Text style={styles.tipText}>{text}</Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  bannerIcon:   { marginTop: 1 },
  bannerText:   { flex: 1, color: colors.textSecondary },
  bannerAction: { color: colors.accent, fontSize: 13, fontWeight: "600" },

  tipBubble: {
    position: "absolute",
    maxWidth: TIP_MAX_WIDTH,
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tipText: { color: colors.onSurfaceDark, fontSize: 12.5, lineHeight: 18 },
});
