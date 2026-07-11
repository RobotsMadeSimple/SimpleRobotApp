import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Info, Trash2 } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";

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
              ? <Trash2 size={22} color="#dc2626" />
              : <Info size={22} color="#2563eb" />}
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
                  {isDestructive && <Trash2 size={15} color="#fff" />}
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
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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
    color: "#111827",
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    color: "#6b7280",
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
    paddingVertical: 12,
  },
  btnStacked: {
    flex: 0,
    alignSelf: "stretch",
  },
  btnDefault: {
    backgroundColor: "#2563eb",
  },
  btnDestructive: {
    backgroundColor: "#dc2626",
  },
  btnCancel: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  btnSolidText: {
    color: "#fff",
  },
  btnCancelText: {
    color: "#6b7280",
    fontWeight: "600",
  },
});
