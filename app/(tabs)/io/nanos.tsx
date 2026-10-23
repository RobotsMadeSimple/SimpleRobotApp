import { IORow } from "@/src/components/ui/io/ioShared";
import { IoSparkline } from "@/src/components/ui/io/IoHistoryGraph";
import { formatLoadCell } from "@/src/components/ui/loadcell";
import { useIsWide } from "@/src/components/ui/responsive";
import { useIoDevices } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { IoDeviceState } from "@/src/models/robotModels";
import { Gauge, LogIn, LogOut, Settings2, Sparkles } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  EmptyState,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  spacing,
  StatTile,
  StatusPill,
  type,
} from "@/src/components/ui/kit";

const GROUP_ICONS = { Inputs: LogIn, Outputs: LogOut, Neopixel: Sparkles } as const;

function NanoDetail({ nano, isWide }: { nano: IoDeviceState; isWide: boolean }) {
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
                  ? () => robotClient.setIoOutput(nano.id, pin.pin, !pin.value)
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
                onPress={() => router.push({ pathname: "/(tabs)/io/loadcell-calibrate", params: { deviceId: nano.id, pin: String(pin.pin) } })}
                right={
                  <View style={styles.lcRight}>
                    <IoSparkline channelKey={`io/${nano.id}/${pin.pin}`} useRaw={!calibrated} />
                    <Text style={[styles.lcValue, !calibrated && styles.lcValueRaw]}>{value}</Text>
                  </View>
                }
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

export default function IoDevicesPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const ioDevices = useIoDevices();
  const isWide = useIsWide();

  const nano = deviceId ? (ioDevices.find(n => n.id === deviceId) ?? null) : null;

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
                  router.push({ pathname: "/(tabs)/io/configure", params: { deviceId: nano.id } })
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
          </>
        ) : (
          <EmptyState title="Device not found." />
        )}
      </Screen>
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
  lcRight:       { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lcValue:       { ...type.body, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  lcValueRaw:    { color: colors.textMuted, fontWeight: "600" },
});
