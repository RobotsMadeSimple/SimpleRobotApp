import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Info, Trash2 } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { colors, shadows, spacing } from "@/src/components/ui/kit";

// A drop-in replacement for React Native's Alert.alert that works on web too
// (Alert.alert button callbacks never fire on React Native Web). Render a single
// <AppAlertHost /> near the app root, then call appAlert(...) from anywhere.

export type AlertButtonStyle = "default" | "cancel" | "destructive";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

interface AlertRequest {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

let enqueue: ((req: AlertRequest) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (enqueue) {
    enqueue({ title, message, buttons });
  } else {
    // Host not mounted — best-effort: fire the first non-cancel action.
    const b = buttons?.find(x => x.style !== "cancel");
    b?.onPress?.();
  }
}

export function AppAlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    enqueue = req => setQueue(q => [...q, req]);
    return () => { enqueue = null; };
  }, []);

  function dismiss(btn?: AlertButton) {
    setQueue(q => q.slice(1));
    btn?.onPress?.();
  }

  const buttons: AlertButton[] = current?.buttons && current.buttons.length > 0
    ? current.buttons
    : [{ text: "OK", style: "default" }];

  const hasDestructive = buttons.some(b => b.style === "destructive");
  const cancelBtn = buttons.find(b => b.style === "cancel");
  const stacked = buttons.length > 2;

  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => dismiss(cancelBtn)}
    >
      <Pressable style={styles.overlay} onPress={() => dismiss(cancelBtn)}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.iconCircle, { backgroundColor: hasDestructive ? "#fee2e2" : "#dbeafe" }]}>
            {hasDestructive
              ? <Trash2 size={22} color={colors.danger} />
              : <Info size={22} color={colors.accent} />}
          </View>

          <Text style={styles.title}>{current?.title}</Text>
          {!!current?.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              return (
                <AnimatedPressable
                  key={i}
                  style={[
                    styles.btn,
                    stacked && styles.btnStacked,
                    isCancel
                      ? styles.btnCancel
                      : isDestructive
                        ? styles.btnDestructive
                        : styles.btnDefault,
                  ]}
                  onPress={() => dismiss(btn)}
                >
                  {isDestructive && <Trash2 size={15} color={colors.onAccent} />}
                  <Text
                    style={[
                      styles.btnText,
                      isCancel ? styles.btnCancelText : styles.btnSolidText,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: spacing.xl,
    paddingBottom: 18,
    alignItems: "center",
    ...shadows.raised,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    alignSelf: "stretch",
  },
  actionsStacked: {
    flexDirection: "column",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
    paddingVertical: spacing.md,
  },
  btnStacked: {
    flex: 0,
    alignSelf: "stretch",
  },
  btnDefault: {
    backgroundColor: colors.accent,
  },
  btnDestructive: {
    backgroundColor: colors.danger,
  },
  btnCancel: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  btnSolidText: {
    color: colors.onAccent,
  },
  btnCancelText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
});
