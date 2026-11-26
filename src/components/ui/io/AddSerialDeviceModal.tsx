import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronLeft, Plug, X } from "lucide-react-native";

import { robotClient } from "@/src/services/RobotConnectService";
import { SerialLineEnding, SerialPortInfo } from "@/src/models/robotModels";
import { useKeyboardStableCard } from "@/src/platform/keyboard";
import {
  Button,
  colors,
  Divider,
  FormRow,
  Input,
  radii,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";

// Preset baud rates offered as chips; "custom" reveals a free-entry field.
const BAUD_PRESETS = [9600, 19200, 38400, 57600, 115200] as const;

const LINE_ENDINGS: { label: string; value: SerialLineEnding }[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
  { label: "CR", value: "cr" },
  { label: "None", value: "none" },
];

/**
 * Two-step Add-a-serial-device flow:
 *   1. Pick an UNUSED serial port (shown with description / manufacturer / VID:PID).
 *   2. Name it, choose a baud rate and a line ending.
 * Then calls AddSerialDevice and hands the new id to `onAdded` (which navigates to the detail page).
 */
export function AddSerialDeviceModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [step, setStep] = useState<"port" | "config">("port");
  const [ports, setPorts] = useState<SerialPortInfo[] | null>(null);
  const [selected, setSelected] = useState<SerialPortInfo | null>(null);
  const [name, setName] = useState("");
  const [baud, setBaud] = useState<number>(9600);
  const [customBaud, setCustomBaud] = useState("");
  const [useCustomBaud, setUseCustomBaud] = useState(false);
  const [lineEnding, setLineEnding] = useState<SerialLineEnding>("lf");
  const [busy, setBusy] = useState(false);

  const { scrollRef: kbScrollRef, onScroll: kbOnScroll, onCardLayout: kbOnCardLayout,
          cardStyle: kbCardStyle, contentPaddingBottom: kbPadBottom } = useKeyboardStableCard(visible && step === "config");

  const loadPorts = () => {
    setPorts(null);
    robotClient.listSerialPorts()
      .then(setPorts)
      .catch(() => setPorts([]));
  };

  // Scan ports when the modal opens. Field state resets via the parent's key-remount, so the only
  // work here is the async fetch (its setState lands in the promise callback, not the effect body).
  useEffect(() => {
    if (!visible) return;
    robotClient.listSerialPorts()
      .then(setPorts)
      .catch(() => setPorts([]));
  }, [visible]);

  const pickPort = (p: SerialPortInfo) => {
    if (p.inUse) return;
    setSelected(p);
    setName(p.description?.trim() || p.portName);
    setStep("config");
  };

  const effectiveBaud = useCustomBaud ? (parseInt(customBaud, 10) || 0) : baud;
  const canAdd = !!selected && name.trim().length > 0 && effectiveBaud > 0;

  const add = async () => {
    if (!selected || !canAdd || busy) return;
    setBusy(true);
    try {
      const id = await robotClient.addSerialDevice({
        name: name.trim(),
        portName: selected.portName,
        baudRate: effectiveBaud,
        writeLineEnding: lineEnding,
      });
      onClose();
      if (id) onAdded(id);
    } finally {
      setBusy(false);
    }
  };

  const portSubtitle = (p: SerialPortInfo) => {
    const bits: string[] = [];
    if (p.description && p.description !== p.portName) bits.push(p.description);
    if (p.manufacturer) bits.push(p.manufacturer);
    if (p.vid || p.pid) bits.push(`${p.vid ?? "?"}:${p.pid ?? "?"}`);
    return bits.join("  ·  ");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, kbCardStyle]}
          onPress={() => {}}
          onLayout={kbOnCardLayout}
        >
          <View style={styles.header}>
            {step === "config" ? (
              <TouchableOpacity style={styles.backRow} onPress={() => setStep("port")} hitSlop={8} activeOpacity={0.7}>
                <ChevronLeft size={18} color={colors.textMuted} />
                <Text style={styles.title} numberOfLines={1}>Configure serial device</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.title}>Add a serial device</Text>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={kbScrollRef}
            onScroll={kbOnScroll}
            scrollEventThrottle={16}
            style={styles.body}
            contentContainerStyle={{ paddingBottom: kbPadBottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === "port" ? (
              <>
                <Text style={styles.subtitle}>
                  Pick the serial port to connect to. Ports already used by another device are shown greyed out.
                </Text>
                {ports == null ? (
                  <View style={styles.loading}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.loadingText}>Scanning ports…</Text>
                  </View>
                ) : ports.length === 0 ? (
                  <Text style={styles.empty}>No serial ports found. Plug in a device and tap Refresh.</Text>
                ) : (
                  ports.map(p => (
                    <TouchableOpacity
                      key={p.portName}
                      style={[styles.portRow, p.inUse && styles.portRowDisabled]}
                      onPress={() => pickPort(p)}
                      disabled={p.inUse}
                      activeOpacity={0.7}
                    >
                      <View style={styles.portIcon}>
                        <Plug size={16} color={p.inUse ? colors.textFaint : colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.portName, p.inUse && styles.portTextDim]}>{p.portName}</Text>
                        {!!portSubtitle(p) && (
                          <Text style={[styles.portSub, p.inUse && styles.portTextDim]} numberOfLines={1}>{portSubtitle(p)}</Text>
                        )}
                        {p.inUse && (
                          <Text style={styles.inUseText} numberOfLines={1}>
                            In use{p.usedBy ? ` — ${p.usedBy}` : ""}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
                <Button label="Refresh" variant="secondary" style={{ marginTop: spacing.sm }} onPress={loadPorts} />
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  {selected?.portName}
                  {selected && portSubtitle(selected) ? `  ·  ${portSubtitle(selected)}` : ""}
                </Text>

                <FormRow label="Name">
                  <Input value={name} onChangeText={setName} placeholder="My serial device" autoFocus returnKeyType="next" />
                </FormRow>
                <Divider />

                <Text style={styles.fieldLabel}>BAUD RATE</Text>
                <View style={styles.chipRow}>
                  {BAUD_PRESETS.map(b => {
                    const active = !useCustomBaud && baud === b;
                    return (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { setUseCustomBaud(false); setBaud(b); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.chip, useCustomBaud && styles.chipActive]}
                    onPress={() => setUseCustomBaud(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, useCustomBaud && styles.chipTextActive]}>Custom</Text>
                  </TouchableOpacity>
                </View>
                {useCustomBaud && (
                  <Input
                    style={{ marginTop: spacing.sm }}
                    value={customBaud}
                    onChangeText={setCustomBaud}
                    keyboardType="numeric"
                    placeholder="e.g. 250000"
                    returnKeyType="done"
                  />
                )}

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>LINE ENDING</Text>
                <SegmentedControl options={LINE_ENDINGS} value={lineEnding} onChange={setLineEnding} />

                <View style={styles.buttons}>
                  <Button label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setStep("port")} />
                  <Button label="Add" style={{ flex: 1 }} loading={busy} disabled={!canAdd} onPress={add} />
                </View>
              </>
            )}
          </ScrollView>
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
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    paddingTop: spacing.lg + 4,
    paddingHorizontal: spacing.lg + 4,
    paddingBottom: spacing.lg,
    ...shadows.raised,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  title: type.pageTitle,
  body: { flexShrink: 1, minHeight: 0 },
  subtitle: { ...type.subtitle, marginBottom: spacing.md, lineHeight: 18 },

  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  loadingText: { fontSize: 13, color: colors.textMuted },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg },

  portRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  portRowDisabled: { opacity: 0.5 },
  portIcon: {
    width: 32, height: 32, borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.background,
  },
  portName: { ...type.body, fontWeight: "600", color: colors.text },
  portSub: { ...type.caption, marginTop: 1 },
  portTextDim: { color: colors.textFaint },
  inUseText: { fontSize: 11, color: colors.warning, marginTop: 1, fontWeight: "600" },

  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textMuted, marginBottom: spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: colors.accent },

  buttons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.lg },
});
