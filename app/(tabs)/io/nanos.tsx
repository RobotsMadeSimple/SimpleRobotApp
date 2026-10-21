import { IORow } from "@/src/components/ui/io/ioShared";
import { formatLoadCell, LOAD_CELL_UNITS } from "@/src/components/ui/loadcell";
import { useIsWide } from "@/src/components/ui/responsive";
import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoState } from "@/src/models/robotModels";
import { Gauge, LogIn, LogOut, Plus, Settings2, Sparkles } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  EmptyState,
  FormRow,
  Input,
  ListRow,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  SegmentedControl,
  shadows,
  spacing,
  StatTile,
  StatusPill,
  type,
} from "@/src/components/ui/kit";

const GROUP_ICONS = { Inputs: LogIn, Outputs: LogOut, Neopixel: Sparkles } as const;

function NanoDetail({ nano, isWide }: { nano: NanoState; isWide: boolean }) {
  const inputs    = nano.pins.filter(p => p.type === "Input");
  const outputs   = nano.pins.filter(p => p.type === "Output");
  const neopixels = nano.pins.filter(p => p.type === "Neopixel");
  const loadcells = nano.pins.filter(p => p.type === "LoadCell");

  const groups = [
    { label: "Inputs",   pins: inputs    },
    { label: "Outputs",  pins: outputs   },
    { label: "Neopixel", pins: neopixels },
  ].filter(g => g.pins.length > 0);

  if (nano.pins.length === 0) {
    return (
      <EmptyState
        title="No pins configured."
        subtitle="Tap the settings icon to configure this board."
      />
    );
  }

  const groupViews = groups.map(g => (
    // groupCol's gap gives SectionHeader its spacing (it relies on parent flex gap).
    <View key={g.label} style={[styles.groupCol, isWide && groups.length > 1 && styles.wideGroupCol]}>
      <SectionHeader title={g.label} icon={GROUP_ICONS[g.label as keyof typeof GROUP_ICONS]} />
      <Card padded={false}>
        {g.pins.map((pin, i) => (
          <React.Fragment key={pin.pin}>
            <IORow
              label={pin.name || `Pin ${pin.pin}`}
              sublabel={`${nano.name} · D${pin.pin}`}
              type={pin.type}
              value={pin.value}
              onToggle={
                pin.type === "Output"
                  ? () => robotClient.setNanoOutput(nano.id, pin.pin, !pin.value)
                  : undefined
              }
            />
            {i < g.pins.length - 1 && <Divider inset />}
          </React.Fragment>
        ))}
      </Card>
    </View>
  ));

  // Load cells render their live weight (grams → display unit), with a tap into the calibrate wizard.
  const loadcellSection = loadcells.length > 0 ? (
    <View style={styles.groupCol}>
      <SectionHeader title="Load Cells" icon={Gauge} />
      <Card padded={false}>
        {loadcells.map((pin, i) => {
          const unit = pin.unit ?? "g";
          const calibrated = (pin.countsPerGram ?? 0) !== 0;
          const value = calibrated
            ? formatLoadCell(pin.grams ?? 0, unit)
            : (pin.raw != null ? `raw ${pin.raw}` : "—");
          const rate = pin.sampleRateHz ? ` · ${Math.round(pin.sampleRateHz)} Hz` : "";
          const sck = pin.sckPin != null && pin.sckPin >= 0 ? ` · SCK D${pin.sckPin}` : "";
          return (
            <React.Fragment key={pin.pin}>
              <ListRow
                card={false}
                title={pin.name || `Load Cell ${pin.pin}`}
                subtitle={`${nano.name} · DT D${pin.pin}${sck}${rate}`}
                icon={<Gauge size={20} color={colors.accent} />}
                iconColor={colors.accentSoft}
                chevron
                onPress={() => router.push({ pathname: "/(tabs)/io/loadcell-calibrate", params: { nanoId: nano.id, pin: String(pin.pin) } })}
                right={<Text style={[styles.lcValue, !calibrated && styles.lcValueRaw]}>{value}</Text>}
              />
              {i < loadcells.length - 1 && <Divider inset />}
            </React.Fragment>
          );
        })}
      </Card>
    </View>
  ) : null;

  // Wide: lay Inputs/Outputs/Neopixel groups out side by side instead of one
  // long stacked column. Narrow: unchanged stacked groups. Load cells sit full-width below.
  const digital = isWide && groups.length > 1
    ? <View style={styles.wideGroupsRow}>{groupViews}</View>
    : <>{groupViews}</>;
  return <>{digital}{loadcellSection}</>;
}

/** Modal to add an HX711 load cell: pick the DT + SCK pins and a display unit. */
function AddLoadCellModal({ nanoId, onClose }: { nanoId: string; onClose: () => void }) {
  const [dt, setDt] = useState("");
  const [sck, setSck] = useState("");
  const [unit, setUnit] = useState("g");
  const [busy, setBusy] = useState(false);

  const dtN = Number(dt), sckN = Number(sck);
  const valid = Number.isInteger(dtN) && Number.isInteger(sckN) && dtN >= 0 && dtN <= 19 && sckN >= 0 && sckN <= 19 && dtN !== sckN;

  const add = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await robotClient.configureLoadCell(nanoId, dtN, sckN, unit);
      onClose();
      router.push({ pathname: "/(tabs)/io/loadcell-calibrate", params: { nanoId, pin: String(dtN) } });
    } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={type.pageTitle}>Add Load Cell</Text>
          <Text style={[type.subtitle, { marginBottom: spacing.sm }]}>
            Wire the HX711 to two Nano pins. DT (data) and SCK (clock) must be different pins.
          </Text>
          <FormRow label="DT pin (data)" hint="e.g. 4">
            <Input value={dt} onChangeText={setDt} keyboardType="numeric" placeholder="D?" style={styles.pinField} />
          </FormRow>
          <Divider />
          <FormRow label="SCK pin (clock)" hint="e.g. 5">
            <Input value={sck} onChangeText={setSck} keyboardType="numeric" placeholder="D?" style={styles.pinField} />
          </FormRow>
          <Divider />
          <FormRow label="Unit">
            <SegmentedControl options={LOAD_CELL_UNITS.map(u => ({ label: u, value: u }))} value={unit} onChange={setUnit} />
          </FormRow>
          <View style={styles.modalButtons}>
            <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button label="Add" style={{ flex: 1 }} loading={busy} disabled={!valid} onPress={add} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function NanosPage() {
  const { nanoId } = useLocalSearchParams<{ nanoId?: string }>();
  const nanos = useNanoIO();
  const isWide = useIsWide();
  const [addLc, setAddLc] = useState(false);

  const nano = nanoId ? (nanos.find(n => n.id === nanoId) ?? null) : null;

  const inputCount    = nano?.pins.filter(p => p.type === "Input").length ?? 0;
  const outputCount   = nano?.pins.filter(p => p.type === "Output").length ?? 0;
  const neopixelCount = nano?.pins.filter(p => p.type === "Neopixel").length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={nano ? nano.name : "Arduino Nano"}
        subtitle={nano ? "Serial-connected microcontroller" : "Device not found"}
        right={
          nano ? (
            <View style={styles.headerActions}>
              <StatusPill
                label={nano.connected ? "Connected" : "Offline"}
                tone={nano.connected ? "success" : "danger"}
                dot
              />
              <Button
                variant="secondary"
                size="sm"
                label="Configure"
                icon={<Settings2 size={15} color={buttonTextColor("secondary")} />}
                onPress={() =>
                  router.push({ pathname: "/(tabs)/io/configure", params: { nanoId: nano.id } })
                }
              />
            </View>
          ) : undefined
        }
      />
      <Screen>
        {nano ? (
          <>
            <View style={styles.statRow}>
              <StatTile label="Inputs" value={inputCount} icon={LogIn} style={styles.statTile} />
              <StatTile label="Outputs" value={outputCount} icon={LogOut}
                        tint={[colors.accent, colors.accentSoft]} style={styles.statTile} />
              <StatTile label="Neopixel" value={neopixelCount} icon={Sparkles}
                        tint={[colors.warning, colors.warningSoft]} style={styles.statTile} />
            </View>
            <NanoDetail nano={nano} isWide={isWide} />
            <Button
              variant="dashed"
              label="Add Load Cell"
              icon={<Plus size={15} color={colors.accent} />}
              onPress={() => setAddLc(true)}
            />
          </>
        ) : (
          <EmptyState title="Device not found." />
        )}
      </Screen>
      {nano && addLc && <AddLoadCellModal nanoId={nano.id} onClose={() => setAddLc(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statRow:       { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statTile:      { flex: 1, minWidth: 130 },
  wideGroupsRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  groupCol:      { gap: spacing.md },
  wideGroupCol:  { flex: 1, minWidth: 0 },
  lcValue:       { ...type.body, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  lcValueRaw:    { color: colors.textMuted, fontWeight: "600" },
  modalOverlay:  { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  modalCard:     { backgroundColor: colors.surface, borderRadius: radii.xl, width: "100%", maxWidth: 400, padding: spacing.lg + 4, gap: spacing.xs, ...shadows.raised },
  modalButtons:  { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.md },
  pinField:      { minWidth: 70, textAlign: "center" },
});
