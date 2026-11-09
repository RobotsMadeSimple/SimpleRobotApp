import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * App-wide haptic feedback. Wired into the shared kit components (Button,
 * Card/ListRow/RadioRow taps, SegmentedControl, Chip) so taps feel physical on
 * device without each screen opting in.
 *
 * Native only — web and Electron have no haptics, so this is a no-op there.
 * Every call is fire-and-forget and swallows errors (a device without a taptic
 * engine, or a transient platform rejection, must never break an interaction).
 */

export type HapticKind =
  | "selection"  // moving between choices: segment/chip/radio/nav row
  | "light"      // a light tap: secondary/ghost buttons
  | "medium"     // a firmer tap: primary buttons, long-press
  | "heavy"      // a strong tap
  | "success"    // an action completed
  | "warning"    // a destructive/guarded action fired (e.g. STOP)
  | "error";     // an action failed

const supported = Platform.OS === "ios" || Platform.OS === "android";

/** Trigger a haptic. Safe to call anywhere; no-ops off-device and never throws. */
export function haptic(kind: HapticKind = "selection"): void {
  if (!supported) return;
  try {
    switch (kind) {
      case "selection":
        void Haptics.selectionAsync().catch(() => {});
        break;
      case "light":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        break;
      case "heavy":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        break;
    }
  } catch {
    /* haptics unavailable — ignore */
  }
}

/**
 * Wrap a press handler so it fires a haptic first, then runs the original.
 * Returns undefined when there's no handler (keeps a Pressable inert/disabled).
 */
export function withHaptic<A extends unknown[]>(
  kind: HapticKind,
  handler: ((...args: A) => void) | undefined,
): ((...args: A) => void) | undefined {
  if (!handler) return undefined;
  return (...args: A) => {
    haptic(kind);
    handler(...args);
  };
}
