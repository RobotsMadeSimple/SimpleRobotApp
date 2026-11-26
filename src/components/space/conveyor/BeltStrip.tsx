import { accents, colors, radii, spacing, type } from "@/src/components/ui/kit";
import type { Conveyor, ConveyorStatus } from "@/src/models/robotModels";
import { ArrowRight } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Spacing of the belt's moving stripes (mm along the belt). */
const STRIPE_MM = 40;
const BELT_H = 44;
const DOT = 12;

/**
 * The belt seen from above, drawn along conveyor X (belt travel left → right): the pick window
 * shaded, the sensor as a marker, the queued parts as dots at their live X (the tracked one
 * ringed), and faint stripes that move with the belt's travel so a running belt reads as moving.
 */
export function BeltStrip({
  conveyor, status, windowOverride,
}: {
  conveyor: Pick<Conveyor, "window" | "sensor">;
  status: ConveyorStatus | null;
  /** Draw this window instead of the conveyor's (the calibration wizard's draft window). */
  windowOverride?: { startMm: number; endMm: number };
}) {
  const [width, setWidth] = useState(0);
  const win = windowOverride ?? conveyor.window;
  const start = Math.min(win.startMm, win.endMm), end = Math.max(win.startMm, win.endMm);
  const hasSensor = conveyor.sensor.kind !== "none";
  const sensorX = conveyor.sensor.offsetMm;

  // Range: everything worth showing (origin, sensor, window, parts) plus a margin either side.
  const parts = status?.parts ?? [];
  const xs = [0, start, end, ...(hasSensor ? [sensorX] : []), ...parts.map(p => p.x)];
  const rawLo = Math.min(...xs), rawHi = Math.max(...xs, rawLo + 100);
  const pad = (rawHi - rawLo) * 0.06;
  const lo = rawLo - pad, hi = rawHi + pad;
  const px = (mm: number) => (width > 0 ? ((mm - lo) / (hi - lo)) * width : 0);

  const travel = status?.travelMm ?? 0;
  const phase = ((travel % STRIPE_MM) + STRIPE_MM) % STRIPE_MM;
  const stripes: number[] = [];
  if (width > 0) {
    for (let mm = Math.floor(lo / STRIPE_MM) * STRIPE_MM + phase; mm < hi; mm += STRIPE_MM) {
      if (mm > lo) stripes.push(px(mm));
    }
  }

  return (
    <View style={s.wrap} accessibilityLabel="Belt">
      <View style={s.belt} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {stripes.map((x, i) => <View key={i} style={[s.stripe, { left: x }]} />)}
        {width > 0 && (
          <View style={[s.window, { left: px(start), width: Math.max(2, px(end) - px(start)) }]} />
        )}
        {width > 0 && hasSensor && (
          <View style={[s.sensor, { left: px(sensorX) - 1 }]} />
        )}
        {width > 0 && parts.map(p => {
          const tracked = status?.trackedPartId === p.id;
          const past = p.x > end;
          const size = tracked ? DOT + 6 : DOT;
          return (
            <View
              key={p.id}
              style={[
                s.part,
                { width: size, height: size, borderRadius: size / 2, left: px(p.x) - size / 2, top: (BELT_H - size) / 2 - 1 },
                past && s.partPast,
                tracked && s.partTracked,
              ]}
            />
          );
        })}
      </View>

      {/* Scale: the window ends and the sensor, in mm along the belt. */}
      <View style={s.scale}>
        {width > 0 && (
          <>
            <Text style={[s.tick, { left: Math.max(0, px(start) - 20) }]} numberOfLines={1}>{fmt(start)}</Text>
            <Text style={[s.tick, { left: Math.min(width - 44, Math.max(px(start) + 24, px(end) - 20)) }]} numberOfLines={1}>{fmt(end)}</Text>
          </>
        )}
      </View>

      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.swatch, s.swatchWindow]} /><Text style={s.legendText}>Window</Text></View>
        {hasSensor && <View style={s.legendItem}><View style={[s.swatch, s.swatchSensor]} /><Text style={s.legendText}>Sensor {fmt(sensorX)}</Text></View>}
        <View style={s.legendItem}><View style={[s.swatch, s.swatchPart]} /><Text style={s.legendText}>Part</Text></View>
        <View style={s.grow} />
        <View style={s.legendItem}>
          <Text style={s.legendText}>Travel</Text>
          <ArrowRight size={13} color={colors.textFaint} />
        </View>
      </View>
    </View>
  );
}

function fmt(mm: number) {
  return `${Math.round(mm)} mm`;
}

const s = StyleSheet.create({
  wrap: { gap: spacing.xs },
  belt: {
    height: BELT_H,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  stripe: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  window: {
    position: "absolute", top: 0, bottom: 0,
    backgroundColor: accents.orangeSoft,
    borderLeftWidth: 2, borderRightWidth: 2, borderColor: accents.orange,
  },
  sensor: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: accents.cyan },
  part: { position: "absolute", backgroundColor: colors.textSecondary, borderWidth: 2, borderColor: colors.surface },
  partPast: { backgroundColor: colors.danger },
  partTracked: { backgroundColor: colors.success, borderColor: colors.successBorder },
  scale: { height: 14 },
  tick: { position: "absolute", width: 44, textAlign: "center", ...type.caption },
  legend: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendText: { ...type.caption },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchWindow: { backgroundColor: accents.orangeSoft, borderWidth: 1, borderColor: accents.orange },
  swatchSensor: { width: 3, backgroundColor: accents.cyan },
  swatchPart: { borderRadius: 5, backgroundColor: colors.textSecondary },
  grow: { flex: 1 },
});
