import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { ColorCoverageInspection, VisionResult } from "@/src/models/robotModels";
import { colors, spacing, radii, shadows } from "@/src/components/ui/kit";

type Status = "pass" | "fail" | "found" | "none";
/** For a color coverage row: the pass band [min,max] and where the reading landed. */
type Bar = { value: number; min: number | null; max: number | null; passed: boolean };
type Row = { id: string; name: string; value: string; status: Status; bar?: Bar; ms?: number };

const STATUS_COLOR: Record<Status, string> = {
  pass:  colors.success,
  found: colors.accent,
  fail:  colors.danger,
  none:  colors.textFaint,
};

/** Flattens a VisionResult into per-inspection rows (name + value + optional bar/timing). */
function buildRows(r: VisionResult, colorInspections?: ColorCoverageInspection[], only?: string): Row[] {
  const rows: Row[] = [];
  const keep = (id: string) => !only || id === only;

  for (const i of r.inspections ?? []) {
    if (!keep(i.inspectionId)) continue;
    const n = i.blobs.length;
    rows.push({ id: i.inspectionId, name: i.name, value: `${n} blob${n !== 1 ? "s" : ""}`, status: n > 0 ? "found" : "none" });
  }
  for (const c of r.colorResults ?? []) {
    if (!keep(c.inspectionId)) continue;
    // The result carries the reading; the pass band lives on the inspection config.
    const insp = colorInspections?.find(ci => ci.id === c.inspectionId);
    const bar: Bar | undefined = insp
      ? { value: c.coverage, min: insp.minCoverage ?? null, max: insp.maxCoverage ?? null, passed: c.passed }
      : undefined;
    rows.push({ id: c.inspectionId, name: c.name, value: `${c.coverage.toFixed(1)}%`, status: c.passed ? "pass" : "fail", bar });
  }
  for (const p of r.polygonResults ?? []) {
    if (!keep(p.inspectionId)) continue;
    rows.push({ id: p.inspectionId, name: p.name, value: p.found ? `${p.count} found · ${p.angle.toFixed(0)}°` : "none", status: p.found ? "found" : "none" });
  }
  for (const a of r.arucoResults ?? []) {
    if (!keep(a.inspectionId)) continue;
    rows.push({ id: a.inspectionId, name: a.name, value: a.found ? `${a.count} · IDs ${a.markers.map(m => m.markerId).join(", ")}` : "none", status: a.found ? "found" : "none" });
  }
  for (const l of r.lineResults ?? []) {
    if (!keep(l.inspectionId)) continue;
    rows.push({ id: l.inspectionId, name: l.name, value: l.found ? `${l.count} line${l.count !== 1 ? "s" : ""}` : "none", status: l.found ? "found" : "none" });
  }
  for (const b of r.barcodeResults ?? []) {
    if (!keep(b.inspectionId)) continue;
    rows.push({ id: b.inspectionId, name: b.name, value: b.found ? b.codes.map(c => c.value).join(", ") : "none", status: b.found ? "found" : "none" });
  }
  // How long each inspection took this frame, keyed by id.
  return rows.map(row => ({ ...row, ms: r.timings?.[row.id] }));
}

const clampPct = (v: number) => `${Math.max(0, Math.min(100, v))}%` as const;

/** A pass/fail chip: green check when passing, red x when failing. */
function PassFailIcon({ status }: { status: Status }) {
  if (status !== "pass" && status !== "fail") return null;
  const passed = status === "pass";
  return (
    <View style={[styles.pfIcon, { backgroundColor: passed ? colors.success : colors.danger }]}>
      {passed ? <Check size={11} color={colors.onAccent} strokeWidth={3.5} /> : <X size={11} color={colors.onAccent} strokeWidth={3.5} />}
    </View>
  );
}

/** The coverage bar: pass band filled between min/max, a circle at the reading. */
function CoverageBar({ bar }: { bar: Bar }) {
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barPass,
          { left: clampPct(bar.min ?? 0), right: clampPct(bar.max != null ? 100 - bar.max : 0) },
        ]}
      />
      <View
        style={[
          styles.barMarker,
          { left: clampPct(bar.value), backgroundColor: bar.passed ? colors.success : colors.danger },
        ]}
      />
    </View>
  );
}

/**
 * Renders vision inspection results as rows (name + value + run time). Color coverage rows
 * also get a bar showing the pass band and where the reading landed — pass the program's
 * `colorInspections` so the thresholds are available.
 *
 * `only` shows a single inspection; `embedded` drops the card chrome and the inspection
 * name (for rendering inside an inspection card, which already shows the name). Returns
 * null when there's nothing to show (e.g. vision not running yet).
 */
export function VisionResults({
  result, only, colorInspections, embedded,
}: {
  result: VisionResult | null;
  only?: string;
  colorInspections?: ColorCoverageInspection[];
  embedded?: boolean;
}) {
  const rows = result ? buildRows(result, colorInspections, only) : [];
  if (rows.length === 0) return null;
  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      {rows.map((row, i) => (
        <View key={row.id} style={[styles.row, !embedded && i > 0 && styles.rowBorder]}>
          {row.bar ? (
            // Color coverage: the bar is the indicator; the reading sits inline at its
            // right with the run time stacked beneath it.
            <View style={styles.barRow}>
              {!embedded && <Text style={styles.name} numberOfLines={1}>{row.name}</Text>}
              <View style={styles.barWrap}><CoverageBar bar={row.bar} /></View>
              <View style={styles.readout}>
                <View style={styles.readoutTop}>
                  <Text style={[styles.valueReadout, { color: STATUS_COLOR[row.status] }]} numberOfLines={1}>
                    {row.value}
                  </Text>
                  <PassFailIcon status={row.status} />
                </View>
                {row.ms != null && <Text style={styles.timing}>{row.ms} ms</Text>}
              </View>
            </View>
          ) : (
            <View style={styles.rowTop}>
              {!embedded && <Text style={styles.name} numberOfLines={1}>{row.name}</Text>}
              <Text
                style={[styles.value, embedded && styles.valueEmbedded, { color: STATUS_COLOR[row.status] }]}
                numberOfLines={1}
              >
                {row.value}
              </Text>
              {row.ms != null && <Text style={styles.timing}>{row.ms} ms</Text>}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.sm, paddingHorizontal: spacing.md },
  cardEmbedded: { backgroundColor: "transparent", borderRadius: 0, paddingHorizontal: 0 },
  row: { paddingVertical: spacing.xs },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textSecondary, userSelect: "none" },
  value: { fontSize: 13, fontWeight: "700", maxWidth: "60%", textAlign: "right", userSelect: "none" },
  // Embedded: no name to the left, so the value leads the row.
  valueEmbedded: { flex: 1, maxWidth: undefined, textAlign: "left" },
  timing: { fontSize: 11, fontWeight: "600", color: colors.textFaint, userSelect: "none" },

  // Coverage row: bar takes the remaining width, reading + time stacked at the right.
  // The bar shrinks (flexShrink) so the reading text is never clipped.
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barWrap: { flex: 1, flexShrink: 1 },
  // Fixed width so the bar's size stays constant regardless of the reading text
  // (e.g. "5.0% PASS" vs "100.0% FAIL"). Sized for the widest case.
  readout: { alignItems: "flex-end", flexShrink: 0, width: 78 },
  readoutTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  valueReadout: { fontSize: 13, fontWeight: "700", userSelect: "none" },
  pfIcon: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },

  // Coverage bar
  barTrack: {
    position: "relative", height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  // Pass-band fill: a bolder green than any success token so it stays visible against
  // the gray track — intentionally not colors.success/successSoft, no matching token.
  barPass: { position: "absolute", top: 0, bottom: 0, backgroundColor: "#86efac", borderRadius: 4 },
  barMarker: {
    position: "absolute", top: -3, width: 14, height: 14, borderRadius: 7, marginLeft: -7,
    borderWidth: 2, borderColor: colors.surface,
    ...shadows.soft,
  },
});
