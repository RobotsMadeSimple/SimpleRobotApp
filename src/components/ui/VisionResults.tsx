import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, Minus, X } from "lucide-react-native";
import { STATUS_LABEL, TOOL_META, mainValueKey, type ToolResult, type VisionResult, type VisionTool } from "@/src/models/visionTools";
import { colors, spacing, radii } from "@/src/components/ui/kit";

/** Formats a value the way the editor shows it everywhere. */
export function fmtVisionValue(v: number | string | undefined): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v || "—";
  if (!Number.isFinite(v) || Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/\.?0+$/, "") || "0";
}

/** One line describing a tool's result: its message when it did not run, else its key values. */
export function summarizeResult(r: ToolResult, tool?: VisionTool): string {
  if (r.status === "notRun" || r.status === "error") return r.message || STATUS_LABEL[r.status];
  const meta = TOOL_META[r.type];
  const vals = r.values ?? {};
  const keys = (meta?.values ?? []).filter(k => k.kind !== "bool" && vals[k.key] !== undefined && !(k.key === "cellsPassed" && r.cells?.length));
  // The judged value first, then the rest — capped so the line stays short.
  const main = tool ? mainValueKey(tool) : meta?.mainValue;
  keys.sort((a, b) => Number(b.key === main) - Number(a.key === main));
  const parts = keys.slice(0, 4).map(k => `${k.label.replace(/ \(.*\)$/, "")} ${fmtVisionValue(vals[k.key])}${k.key.toLowerCase().includes("angle") ? "°" : ""}`);
  if (r.cells?.length) parts.unshift(`${r.cells.filter(c => c.passed).length}/${r.cells.length} cells`);
  const text = parts.join(" · ");
  if (!r.passed && r.message) return text ? `${text} — ${r.message}` : r.message;
  return text || (r.passed ? "OK" : "Fail");
}

export type ChipKind = "ok" | "fail" | "notRun" | "error" | "none";

export function chipKind(r: ToolResult | undefined): ChipKind {
  if (!r) return "none";
  if (r.status === "notRun") return "notRun";
  if (r.status === "error") return "error";
  return r.passed ? "ok" : "fail";
}

const CHIP: Record<ChipKind, { fg: string; bg: string; label: string }> = {
  ok:     { fg: colors.success, bg: colors.successSoft, label: "OK" },
  fail:   { fg: colors.danger, bg: colors.dangerSoft, label: "Fail" },
  notRun: { fg: colors.textMuted, bg: colors.surfaceMuted, label: "Not run" },
  error:  { fg: colors.warning, bg: colors.warningSoft, label: "Error" },
  none:   { fg: colors.textFaint, bg: colors.surfaceMuted, label: "—" },
};

/** OK / Fail / Not run / Error chip for a tool result. */
export function StatusChip({ result, kind }: { result?: ToolResult; kind?: ChipKind }) {
  const k = kind ?? chipKind(result);
  const c = CHIP[k];
  const Icon = k === "ok" ? Check : k === "fail" || k === "error" ? X : Minus;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Icon size={11} color={c.fg} strokeWidth={3} />
      <Text style={[styles.chipText, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

/**
 * Renders a vision result as rows — tool name, status chip, its key values (or why it did not
 * run) and run time — headed by the overall pass. Pass the program's `tools` for names.
 *
 * `only` shows a single tool; `embedded` drops the card chrome and the name (for rendering inside
 * a tool card, which already shows the name). Returns null when there is nothing to show.
 */
export function VisionResults({ result, tools, only, embedded }: {
  result: VisionResult | null;
  tools?: VisionTool[];
  only?: string;
  embedded?: boolean;
}) {
  if (!result || !Array.isArray(result.tools)) return null;
  const rows = result.tools.filter(r => !only || r.id === only);
  if (rows.length === 0) return null;
  const nameOf = (r: ToolResult) => tools?.find(t => t.id === r.id)?.name ?? TOOL_META[r.type]?.label ?? r.id;
  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      {!only && (
        <View style={[styles.row, styles.overall]}>
          <Text style={styles.overallText}>Overall</Text>
          <StatusChip kind={result.passed ? "ok" : "fail"} />
        </View>
      )}
      {rows.map((r, i) => {
        const tool = tools?.find(t => t.id === r.id);
        const ms = r.timeMs ?? result.timings?.[r.id];
        return (
          <View key={r.id} style={[styles.row, !embedded && (i > 0 || !only) && styles.rowBorder, r.status === "notRun" && { opacity: 0.6 }]}>
            {!embedded && <Text style={styles.name} numberOfLines={1}>{nameOf(r)}</Text>}
            <Text style={[styles.value, embedded && styles.valueEmbedded]} numberOfLines={2}>{summarizeResult(r, tool)}</Text>
            {ms != null && <Text style={styles.timing}>{fmtVisionValue(ms)} ms</Text>}
            <StatusChip result={r} />
          </View>
        );
      })}
      {!only && (result.errors ?? []).map(e => (
        <Text key={e} style={styles.error} numberOfLines={2}>{e}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.sm, paddingHorizontal: spacing.md },
  cardEmbedded: { backgroundColor: "transparent", borderRadius: 0, paddingHorizontal: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  overall: { paddingVertical: spacing.sm },
  overallText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text, userSelect: "none" },
  name: { width: "34%", fontSize: 13, fontWeight: "600", color: colors.textSecondary, userSelect: "none" },
  value: { flex: 1, fontSize: 12, color: colors.textMuted, textAlign: "right", userSelect: "none" },
  valueEmbedded: { textAlign: "left" },
  timing: { fontSize: 11, fontWeight: "600", color: colors.textFaint, userSelect: "none" },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: "700" },
  error: { fontSize: 12, color: colors.warning, paddingVertical: 4 },
});
