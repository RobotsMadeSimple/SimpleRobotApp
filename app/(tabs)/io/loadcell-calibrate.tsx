import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle2, Circle, Download, ListChecks, Save, Scale, Square } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { IoHistoryGraph } from "@/src/components/ui/io/IoHistoryGraph";
import {
  Button, buttonTextColor, Card, colors, Divider, FormRow, Input, PageHeader, Screen, SectionHeader,
  SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import { formatLoadCell, LOAD_CELL_UNITS, unitToGrams } from "@/src/components/ui/loadcell";
import type { IoRecordingMeta, LoadCellUnit } from "@/src/models/robotModels";
import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { exportSamplesCsv } from "@/src/services/ioExport";

const RETENTION_PRESETS = [
  { label: "1m", value: "60000" },
  { label: "5m", value: "300000" },
  { label: "10m", value: "600000" },
  { label: "30m", value: "1800000" },
  { label: "1h", value: "3600000" },
];

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

  // ── Live graph + recording ──────────────────────────────────────────────────
  const channelKey = nanoId ? `nano/${nanoId}/${pinNum}` : null;
  const [recording, setRecording] = useState<IoRecordingMeta | null>(null); // active
  const [lastRec, setLastRec]     = useState<IoRecordingMeta | null>(null);  // just stopped
  const [elapsed, setElapsed]     = useState(0);
  const [recBusy, setRecBusy]     = useState(false);
  const [expBusy, setExpBusy]     = useState(false);
  const [saveBusy, setSaveBusy]   = useState(false);
  const [retentionMs, setRetentionMs] = useState(600_000);

  useEffect(() => { robotClient.getIoHistoryConfig().then(c => setRetentionMs(c.maxRetentionMs)).catch(() => {}); }, []);

  // Tick the elapsed timer while a recording is active.
  useEffect(() => {
    if (!recording?.active) return;
    const start = recording.startUnixMs;
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [recording]);

  const startRec = async () => {
    if (!channelKey) return;
    setRecBusy(true);
    try { setLastRec(null); setRecording(await robotClient.startIoRecording(channelKey)); }
    catch (e) { appAlert("Recording failed", String(e)); }
    finally { setRecBusy(false); }
  };
  const stopRec = async () => {
    if (!recording) return;
    setRecBusy(true);
    try { setLastRec(await robotClient.stopIoRecording(recording.id)); setRecording(null); }
    catch (e) { appAlert("Stop failed", String(e)); }
    finally { setRecBusy(false); }
  };
  const exportLast = async () => {
    if (!lastRec) return;
    setExpBusy(true);
    try {
      const { window } = await robotClient.getIoRecordingWindow(lastRec.id, undefined, undefined, 1_000_000);
      await exportSamplesCsv(lastRec.name, window.samples, unit);
    } catch (e) { appAlert("Export failed", String(e)); }
    finally { setExpBusy(false); }
  };
  const saveLast = async () => {
    if (!lastRec) return;
    setSaveBusy(true);
    try { setLastRec(await robotClient.saveIoRecording(lastRec.id)); }
    catch (e) { appAlert("Save failed", String(e)); }
    finally { setSaveBusy(false); }
  };
  const changeRetention = (v: string) => {
    const ms = Number(v);
    setRetentionMs(ms);
    robotClient.setIoHistoryRetention(ms).catch(() => {});
  };
  const recDurationLabel = lastRec?.endUnixMs
    ? ` · ${Math.max(1, Math.round((lastRec.endUnixMs - lastRec.startUnixMs) / 1000))}s`
    : "";

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

        {/* Live graph + recording */}
        <SectionHeader title="Live graph" />
        <Card style={styles.stack}>
          <IoHistoryGraph channelKey={channelKey} unit={unit} useRaw={!calibrated} windowMs={20000} height={180} />
          <View style={styles.recRow}>
            {recording?.active ? (
              <Button
                label={`Stop · ${elapsed}s`}
                variant="destructive"
                icon={<Square size={15} color={buttonTextColor("destructive")} />}
                loading={recBusy}
                onPress={stopRec}
                style={styles.grow}
              />
            ) : (
              <Button
                label="Record"
                icon={<Circle size={15} color={colors.onAccent} />}
                loading={recBusy}
                onPress={startRec}
                disabled={!channelKey}
                style={styles.grow}
              />
            )}
            <Button
              label="Recordings"
              variant="secondary"
              icon={<ListChecks size={15} color={buttonTextColor("secondary")} />}
              onPress={() => router.push({ pathname: "/(tabs)/io/recordings", params: channelKey ? { channelKey } : {} })}
            />
          </View>

          {lastRec && !lastRec.active && (
            <View style={styles.lastRec}>
              <Text style={type.body}>
                {lastRec.name} · {lastRec.sampleCount} samples{recDurationLabel}
              </Text>
              <View style={styles.recRow}>
                <Button
                  label="Export CSV"
                  variant="secondary"
                  icon={<Download size={15} color={buttonTextColor("secondary")} />}
                  loading={expBusy}
                  onPress={exportLast}
                  style={styles.grow}
                />
                <Button
                  label={lastRec.saved ? "Saved" : "Save"}
                  variant="secondary"
                  icon={<Save size={15} color={buttonTextColor("secondary")} />}
                  loading={saveBusy}
                  disabled={lastRec.saved}
                  onPress={saveLast}
                  style={styles.grow}
                />
              </View>
            </View>
          )}

          <Divider />
          <FormRow label="Keep history" hint="How long the rolling live history is kept in memory (saved recordings are kept regardless).">
            <SegmentedControl options={RETENTION_PRESETS} value={String(retentionMs)} onChange={changeRetention} />
          </FormRow>
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
  recRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  grow: { flex: 1 },
  lastRec: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.sm },
});
