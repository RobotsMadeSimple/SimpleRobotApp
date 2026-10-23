import { CheckCircle2, ChevronLeft, Scale, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IoHistoryGraph } from "@/src/components/ui/io/IoHistoryGraph";
import {
  Button, buttonTextColor, colors, Divider, FormRow, Input, radii, spacing, type,
} from "@/src/components/ui/kit";
import { formatLoadCell, unitToGrams } from "@/src/components/ui/loadcell";
import type { LoadCellUnit } from "@/src/models/robotModels";
import { useIoDevices } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

type Props = {
  visible: boolean;
  onClose: () => void;
  deviceId?: string;
  pin: number;
};

/**
 * Multi-step calibration wizard, shown in a modal (never flattened onto a page). Step 1 zeroes
 * the cell (tare), step 2 teaches the scale with one known weight, then a confirmation. Grams is
 * the master unit; the known weight is entered in the cell's display unit and converted before
 * sending. The live reading (and a small graph) stay visible so you can watch the value settle.
 */
export function LoadCellCalibrateWizard({ visible, onClose, deviceId, pin }: Props) {
  const insets = useSafeAreaInsets();
  const ioDevices = useIoDevices();
  const cell = useMemo(() => {
    const nano = ioDevices.find(n => n.id === deviceId);
    return nano?.pins.find(p => p.pin === pin && p.type === "LoadCell") ?? null;
  }, [ioDevices, deviceId, pin]);

  const unit = (cell?.unit ?? "g") as LoadCellUnit;
  const calibrated = (cell?.countsPerGram ?? 0) !== 0;
  const grams = cell?.grams ?? 0;
  const raw = cell?.raw;
  const channelKey = deviceId ? `io/${deviceId}/${pin}` : null;

  const [step, setStep] = useState(0); // 0 Zero · 1 Scale · 2 Done
  const [known, setKnown] = useState("");
  const [busy, setBusy] = useState<"tare" | "cal" | null>(null);

  // Fresh start every time the wizard opens. Deferred (not a synchronous setState in the
  // effect body) to satisfy the react-compiler rule; the modal animates in over this tick.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => { setStep(0); setKnown(""); setBusy(null); }, 0);
    return () => clearTimeout(t);
  }, [visible]);

  const tare = async () => {
    if (!deviceId) return;
    setBusy("tare");
    try { await robotClient.tareLoadCell(deviceId, pin); setStep(1); }
    finally { setBusy(null); }
  };
  const capture = async () => {
    if (!deviceId) return;
    const v = parseFloat(known);
    if (!isFinite(v) || v <= 0) return;
    setBusy("cal");
    try { await robotClient.calibrateLoadCell(deviceId, pin, unitToGrams(v, unit)); setStep(2); }
    finally { setBusy(null); }
  };

  const reading = (
    <View style={styles.reading}>
      <Text style={styles.readingValue}>
        {calibrated ? formatLoadCell(grams, unit) : (raw != null ? `${raw}` : "—")}
      </Text>
      <Text style={type.caption}>
        {calibrated ? "current weight" : "raw count"}
        {raw != null ? ` · raw ${raw}` : ""}
        {cell?.sampleRateHz ? ` · ${Math.round(cell.sampleRateHz)} Hz` : ""}
      </Text>
    </View>
  );

  const stepLabel = step === 2 ? "Done" : `Step ${step + 1} of 2`;

  // Anchored near the top (not a bottom sheet): the known-weight step needs the number pad, which
  // would cover a bottom-anchored sheet. Body scrolls so the input + footer stay reachable above
  // the keyboard on short screens.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { marginTop: insets.top + spacing.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{`Calibrate · ${stepLabel}`}</Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textFaint} /></Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            {reading}

            {step < 2 && channelKey && (
              <IoHistoryGraph channelKey={channelKey} unit={unit} useRaw={!calibrated} windowMs={20000} height={120} />
            )}

            {step === 0 && (
              <View style={styles.body}>
                <Text style={type.body}>Remove all weight from the load cell, then tare to set the zero offset.</Text>
              </View>
            )}

            {step === 1 && (
              <View style={styles.body}>
                <Text style={type.body}>Place a known weight on the cell, enter its value, then capture. Watch the reading settle first.</Text>
                <FormRow label={`Known weight (${unit})`}>
                  <Input
                    value={known}
                    onChangeText={setKnown}
                    placeholder={`e.g. ${unit === "g" ? "500" : "1"}`}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={capture}
                    style={styles.weightInput}
                  />
                </FormRow>
              </View>
            )}

            {step === 2 && (
              <View style={styles.body}>
                <View style={styles.doneRow}>
                  <CheckCircle2 size={18} color={colors.success} />
                  <Text style={type.body}>
                    Calibrated · {cell?.countsPerGram?.toFixed(2)} counts/g.
                  </Text>
                </View>
                <Text style={type.caption}>Re-run this wizard any time to re-zero or refine the scale.</Text>
              </View>
            )}

            <Divider />
            <View style={styles.footer}>
              {step === 1 && (
                <Button
                  label="Back"
                  variant="secondary"
                  icon={<ChevronLeft size={15} color={buttonTextColor("secondary")} />}
                  onPress={() => setStep(0)}
                  style={styles.grow}
                />
              )}
              {step === 0 && (
                <Button label="Tare & continue" loading={busy === "tare"} onPress={tare} style={styles.grow} />
              )}
              {step === 1 && (
                <Button
                  label="Capture calibration"
                  icon={<Scale size={16} color={colors.onAccent} />}
                  loading={busy === "cal"}
                  disabled={!(parseFloat(known) > 0)}
                  onPress={capture}
                  style={styles.grow}
                />
              )}
              {step === 2 && (
                <Button label="Done" onPress={onClose} style={styles.grow} />
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-start", backgroundColor: colors.overlay },
  sheet: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radii.xl,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, maxHeight: "82%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  scroll: { gap: spacing.xs, paddingBottom: spacing.sm },
  reading: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  readingValue: { fontSize: 36, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  body: { gap: spacing.md, paddingTop: spacing.sm },
  weightInput: { minWidth: 120, textAlign: "right" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingTop: spacing.xs },
  grow: { flex: 1 },
});
