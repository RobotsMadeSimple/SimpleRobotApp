import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "@/src/components/ui/kit";
import { cellPosition, cornerCell, CornerKey, GridFit, Vec3 } from "./gridFit";

const MAX_DRAWN = 10;

/** Index of the drawn cell standing for real index `i` of `n` (large grids are drawn shrunk). */
const drawnIndex = (i: number, n: number) => (n <= MAX_DRAWN ? i : Math.round((i * (MAX_DRAWN - 1)) / (n - 1)));

/**
 * Schematic of an R×C grid with its teachable corners lettered: the one to teach now is
 * highlighted, the taught ones ticked. Large grids are drawn at most 10×10 (corners stay corners).
 */
export function GridSchematic({
  rows, cols, corners, active, taught, size = 200,
}: {
  rows: number;
  cols: number;
  /** Corners this method teaches. */
  corners: CornerKey[];
  active?: CornerKey;
  taught?: Partial<Record<CornerKey, unknown>>;
  size?: number;
}) {
  const dr = Math.max(1, Math.min(rows, MAX_DRAWN)), dc = Math.max(1, Math.min(cols, MAX_DRAWN));
  const cell = Math.floor(Math.min(28, size / Math.max(dr, dc)));
  const letterAt = new Map<string, CornerKey>();
  for (const k of corners) {
    const { row, col } = cornerCell(k, rows, cols);
    letterAt.set(`${drawnIndex(row, rows)},${drawnIndex(col, cols)}`, k);
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.axisTop}>columns →</Text>
      <View style={styles.row}>
        <Text style={styles.axisSide}>rows ↓</Text>
        <View style={[styles.board, { width: dc * cell + 2, height: dr * cell + 2 }]}>
          {Array.from({ length: dr }, (_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: dc }, (_, c) => {
                const k = letterAt.get(`${r},${c}`);
                const isActive = !!k && k === active;
                const isTaught = !!k && !!taught?.[k];
                return (
                  <View
                    key={c}
                    style={[
                      styles.cell, { width: cell, height: cell },
                      (r + c) % 2 === 1 && styles.cellAlt,
                      isTaught && styles.cellTaught,
                      isActive && styles.cellActive,
                    ]}
                  >
                    {k && (
                      <Text style={[styles.letter, (isActive || isTaught) && styles.letterOn, { fontSize: Math.max(9, cell * 0.45) }]}>
                        {isTaught && !isActive ? "✓" : k}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
      {(rows > MAX_DRAWN || cols > MAX_DRAWN) && (
        <Text style={styles.caption}>{rows} × {cols} grid, drawn smaller</Text>
      )}
    </View>
  );
}

/** "A — row 1, column 1" style label for a corner (1-based for people). */
export function cornerLabel(k: CornerKey, rows: number, cols: number) {
  const { row, col } = cornerCell(k, rows, cols);
  return `${k} · row ${row + 1}, column ${col + 1}`;
}

/**
 * Top view (robot X right, Y up) of where the fitted grid puts every cell, with the taught
 * corners ringed. This is what actually gets saved — use it to catch a mirrored 2-point fit.
 */
export function GridPreview({
  fit, rows, cols, taught, width = 280, height = 220,
}: {
  fit: GridFit;
  rows: number;
  cols: number;
  taught: Partial<Record<CornerKey, Vec3>>;
  width?: number;
  height?: number;
}) {
  // Sample big grids so the drawing stays light: every k-th row/column plus the last.
  const pick = (n: number) => {
    const step = Math.max(1, Math.ceil(n / 24));
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    if (out[out.length - 1] !== n - 1) out.push(n - 1);
    return out;
  };
  const rs = pick(rows), cs = pick(cols);
  const cells = rs.flatMap(r => cs.map(c => ({ r, c, p: cellPosition(fit, r, c) })));
  const marks = Object.entries(taught).filter(([, p]) => !!p) as [CornerKey, Vec3][];
  const all = [...cells.map(c => c.p), ...marks.map(([, p]) => p)];
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const pad = 18;
  const scale = Math.min((width - 2 * pad) / Math.max(1e-6, maxX - minX), (height - 2 * pad) / Math.max(1e-6, maxY - minY));
  const sx = (x: number) => pad + (x - minX) * scale + ((width - 2 * pad) - (maxX - minX) * scale) / 2;
  const sy = (y: number) => height - pad - (y - minY) * scale - ((height - 2 * pad) - (maxY - minY) * scale) / 2;
  const dot = Math.max(4, Math.min(10, (Math.min(fit.rowPitch, fit.colPitch) || 10) * scale * 0.5));

  return (
    <View style={styles.wrap}>
      <View style={[styles.preview, { width, height }]}>
        {cells.map(({ r, c, p }) => {
          const origin = r === 0 && c === 0;
          const firstRow = r === 0;
          const d = origin ? dot + 4 : dot;
          return (
            <View
              key={`${r},${c}`}
              style={[
                styles.pdot,
                { left: sx(p.x) - d / 2, top: sy(p.y) - d / 2, width: d, height: d, borderRadius: d / 2 },
                firstRow && styles.pdotFirstRow,
                origin && styles.pdotOrigin,
              ]}
            />
          );
        })}
        {marks.map(([k, p]) => (
          <View key={k} style={[styles.ring, { left: sx(p.x) - 9, top: sy(p.y) - 9 }]}>
            <Text style={styles.ringText}>{k}</Text>
          </View>
        ))}
        <Text style={[styles.axisCorner, { left: 6, bottom: 4 }]}>+X →</Text>
        <Text style={[styles.axisCorner, { left: 6, top: 4 }]}>↑ +Y</Text>
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: colors.accent }]} /><Text style={styles.caption}>cell 1,1 (origin)</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.warning }]} /><Text style={styles.caption}>first row</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.textFaint }]} /><Text style={styles.caption}>other cells</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  axisTop: { ...type.caption, marginLeft: 40 },
  axisSide: { ...type.caption, width: 36, textAlign: "right" },
  board: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, overflow: "hidden" },
  boardRow: { flexDirection: "row" },
  cell: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  cellAlt: { backgroundColor: colors.surfaceMuted },
  cellTaught: { backgroundColor: colors.successSoft },
  cellActive: { backgroundColor: colors.accent },
  letter: { fontWeight: "800", color: colors.textMuted },
  letterOn: { color: colors.text },
  caption: { ...type.caption },
  preview: {
    position: "relative", borderRadius: radii.md, overflow: "hidden",
    backgroundColor: colors.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  pdot: { position: "absolute", backgroundColor: colors.textFaint },
  pdotFirstRow: { backgroundColor: colors.warning },
  pdotOrigin: { backgroundColor: colors.accent },
  ring: {
    position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.success,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent",
  },
  ringText: { fontSize: 9, fontWeight: "800", color: colors.success, marginTop: -16, marginLeft: 18 },
  axisCorner: { position: "absolute", ...type.caption, fontSize: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center" },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm },
});
