import { useLocalSearchParams } from "expo-router";
import { CheckCircle2, Scale } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button, Card, colors, Divider, FormRow, Input, PageHeader, Screen, SectionHeader,
  SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import { formatLoadCell, LOAD_CELL_UNITS, unitToGrams } from "@/src/components/ui/loadcell";
import type { LoadCellUnit } from "@/src/models/robotModels";
import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * Load cell calibration wizard: pick a display unit, zero the cell (tare = 0 offset), then teach the
 * scale with one known weight (2-point: no-load tare + known added weight). Grams is the master unit;
 * the known weight is entered in the chosen display unit and converted to grams before sending.
 */
export default function LoadCellCalibrateScreen() {
  const { nanoId, pin } = useLocalSearchParams<{ nanoId?: string; pin?: string }>();
  const pinNum = Number(pin);
  const nanos = useNanoIO();

  const cell = useMemo(() => {
    const nano = nanos.find(n => n.id === nanoId);
    const p = nano?.pins.find(pp => pp.pin === pinNum && pp.type === "LoadCell");
    return p ? { nano, p } : null;
  }, [nanos, nanoId, pinNum]);

  const unit = (cell?.p.unit ?? "g") as LoadCellUnit;
  const calibrated = (cell?.p.countsPerGram ?? 0) !== 0;
  const grams = cell?.p.grams ?? 0;
  const raw = cell?.p.raw;

  const [known, setKnown] = useState("");
  const [busy, setBusy] = useState<"tare" | "cal" | null>(null);

  const crumbs = [{ label: "I/O", href: "/io" }, { label: cell?.nano?.name ?? "Nano", href: nanoId ? `/io/nanos?nanoId=${nanoId}` : "/io" }, { label: "Calibrate" }];

  const setUnit = (u: string) => { if (nanoId) robotClient.setLoadCellUnit(nanoId, pinNum, u).catch(() => {}); };
  const tare = async () => { if (!nanoId) return; setBusy("tare"); try { await robotClient.tareLoadCell(nanoId, pinNum); } finally { setBusy(null); } };
  const calibrate = async () => {
    if (!nanoId) return;
    const v = parseFloat(known);
    if (!isFinite(v) || v <= 0) return;
    setBusy("cal");
    try { await robotClient.calibrateLoadCell(nanoId, pinNum, unitToGrams(v, unit)); setKnown(""); }
    finally { setBusy(null); }
  };

  if (!cell) {
    return (
      <View style={styles.container}>
        <PageHeader title="Calibrate" subtitle="Load cell not found" crumbs={crumbs} />
        <Screen><Card><Text style={type.body}>This load cell is no longer configured.</Text></Card></Screen>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title={cell.p.name || `Load Cell ${pinNum}`}
        subtitle="Tare, then teach the scale with a known weight"
        crumbs={crumbs}
        right={<StatusPill label={calibrated ? "Calibrated" : "Uncalibrated"} tone={calibrated ? "success" : "neutral"} dot={calibrated} />}
      />
      <Screen>
        {/* Live reading */}
        <Card style={styles.readingCard}>
          <Text style={styles.readingValue}>
            {calibrated ? formatLoadCell(grams, unit) : (raw != null ? `${raw}` : "—")}
          </Text>
          <Text style={type.caption}>
            {calibrated ? "current weight" : "raw count (calibrate to read weight)"}
            {raw != null ? ` · raw ${raw}` : ""}
            {cell.p.sampleRateHz ? ` · ${Math.round(cell.p.sampleRateHz)} Hz` : ""}
          </Text>
        </Card>

        <SectionHeader title="Units" />
        <Card>
          <FormRow label="Display unit" hint="Grams is the master behind the scenes; this is just how the value is shown.">
            <SegmentedControl
              options={LOAD_CELL_UNITS.map(u => ({ label: u, value: u }))}
              value={unit}
              onChange={setUnit}
            />
          </FormRow>
        </Card>

        <SectionHeader title="Step 1 — Zero" />
        <Card style={styles.stack}>
          <Text style={type.body}>Remove all weight from the load cell, then tare to set the zero offset.</Text>
          <Button label="Tare (set zero)" variant="secondary" loading={busy === "tare"} onPress={tare} />
        </Card>

        <SectionHeader title="Step 2 — Scale" />
        <Card style={styles.stack}>
          <Text style={type.body}>Place a known weight on the cell, enter its value, and capture.</Text>
          <FormRow label={`Known weight (${unit})`}>
            <Input
              value={known}
              onChangeText={setKnown}
              placeholder={`e.g. ${unit === "g" ? "500" : unit === "kg" ? "1" : "1"}`}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={calibrate}
              style={styles.weightInput}
            />
          </FormRow>
          <Button
            label="Capture calibration"
            icon={<Scale size={16} color={colors.onAccent} />}
            loading={busy === "cal"}
            disabled={!(parseFloat(known) > 0)}
            onPress={calibrate}
          />
          {calibrated && (
            <View style={styles.doneRow}>
              <CheckCircle2 size={16} color={colors.success} />
              <Text style={type.caption}>
                Calibrated · {cell.p.countsPerGram?.toFixed(2)} counts/g. Re-tare or re-capture any time to refine.
              </Text>
            </View>
          )}
          <Divider />
          <Text style={type.caption}>
            Tip: the reading updates live — place/remove the weight and watch it settle before capturing. For the
            force-move feature, 80 SPS (HX711 RATE pin high) gives much smoother control than the 10 SPS default.
          </Text>
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
  readingCard: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  readingValue: { fontSize: 40, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  weightInput: { minWidth: 120, textAlign: "right" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});
