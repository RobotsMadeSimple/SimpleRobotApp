import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { VisionResult } from "@/src/models/robotModels";

type Status = "pass" | "fail" | "found" | "none";
type Row = { id: string; name: string; value: string; status: Status };

const STATUS_COLOR: Record<Status, string> = {
  pass:  "#16a34a",
  found: "#2563eb",
  fail:  "#dc2626",
  none:  "#9ca3af",
};

/** Flattens a VisionResult into per-inspection text rows (name + value). */
function buildRows(r: VisionResult, only?: string): Row[] {
  const rows: Row[] = [];
  const keep = (id: string) => !only || id === only;

  for (const i of r.inspections ?? []) {
    if (!keep(i.inspectionId)) continue;
    const n = i.blobs.length;
    rows.push({ id: i.inspectionId, name: i.name, value: `${n} blob${n !== 1 ? "s" : ""}`, status: n > 0 ? "found" : "none" });
  }
  for (const c of r.colorResults ?? []) {
    if (!keep(c.inspectionId)) continue;
    rows.push({ id: c.inspectionId, name: c.name, value: `${c.coverage.toFixed(1)}%  ${c.passed ? "PASS" : "FAIL"}`, status: c.passed ? "pass" : "fail" });
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
  return rows;
}

/**
 * Renders vision inspection results as text (one row per inspection). Pass
 * `only` to show a single inspection's result. Returns null if there's nothing
 * to show (e.g. vision not running yet).
 */
export function VisionResults({ result, only }: { result: VisionResult | null; only?: string }) {
  const rows = result ? buildRows(result, only) : [];
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      {rows.map((row, i) => (
        <View key={row.id} style={[styles.row, i > 0 && styles.rowBorder]}>
          <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
          <Text style={[styles.value, { color: STATUS_COLOR[row.status] }]} numberOfLines={1}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f0f0f0" },
  name: { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151" },
  value: { fontSize: 13, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
});
