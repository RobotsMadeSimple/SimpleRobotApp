import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line as SvgLine, Polyline } from "react-native-svg";

import { colors, radii, spacing, type } from "@/src/components/ui/kit";
import { formatLoadCell } from "@/src/components/ui/loadcell";
import type { IoSample, LoadCellUnit } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";

// Live IO history charts built on react-native-svg (works on web + native + Electron).
// A channel's samples are streamed from the controller (/io/history/ws); the hook keeps a
// rolling in-memory window and repaints on a steady tick so the trace scrolls smoothly.

const LINE = "#22d3ee"; // cyan trace, matches the robot-path map

/** Rolling window of live samples for one channel, fed by the controller stream.
 * Samples accumulate in a ref (written at up to 80 Hz); a 100 ms tick publishes an
 * immutable snapshot as state, so render never reads a ref and still scrolls smoothly. */
export function useLiveSamples(channelKey: string | null, windowMs: number, enabled = true) {
  const bufRef = useRef<IoSample[]>([]);
  const latestRef = useRef<IoSample | null>(null);
  const [snapshot, setSnapshot] = useState<{ samples: IoSample[]; latest: IoSample | null }>(
    { samples: [], latest: null });

  useEffect(() => {
    bufRef.current = [];
    latestRef.current = null;
    // Clear last channel's trace (deferred so it isn't a synchronous setState in the effect body).
    const clear = setTimeout(() => setSnapshot({ samples: [], latest: null }), 0);
    if (!channelKey || !enabled) return () => clearTimeout(clear);

    const close = robotClient.openIoHistoryStream(channelKey, windowMs, batch => {
      const buf = bufRef.current;
      for (const s of batch) buf.push(s);
      latestRef.current = buf[buf.length - 1] ?? null;
      const newest = buf[buf.length - 1]?.t ?? 0;
      const cutoff = newest - windowMs;
      let i = 0;
      while (i < buf.length && buf[i].t < cutoff) i++;
      if (i > 0) buf.splice(0, i);
    });
    // Publish a snapshot on a steady tick so the trace scrolls between batches.
    const iv = setInterval(() => setSnapshot({ samples: bufRef.current.slice(), latest: latestRef.current }), 100);
    return () => { clearTimeout(clear); clearInterval(iv); close(); };
  }, [channelKey, windowMs, enabled]);

  return snapshot;
}

function pointsFor(
  samples: IoSample[], getY: (s: IoSample) => number,
  width: number, height: number, pad: number,
): { pts: string; minY: number; maxY: number } {
  if (samples.length === 0 || width <= 0) return { pts: "", minY: 0, maxY: 0 };
  let minT = samples[0].t, maxT = samples[samples.length - 1].t;
  let minY = Infinity, maxY = -Infinity;
  for (const s of samples) { const y = getY(s); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!isFinite(minY)) { minY = 0; maxY = 0; }
  // A flat line sits in the middle rather than glued to an edge.
  if (maxY - minY < 1e-9) { minY -= 1; maxY += 1; }
  const spanT = Math.max(1, maxT - minT);
  const spanY = maxY - minY;
  const pts = samples.map(s => {
    const x = pad + ((s.t - minT) / spanT) * (width - 2 * pad);
    const y = height - pad - ((getY(s) - minY) / spanY) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return { pts, minY, maxY };
}

// ── Inline sparkline (always-on "last X seconds" on the IO card) ───────────────

export function IoSparkline({
  channelKey, windowMs = 15000, width = 76, height = 26, useRaw = false, enabled = true,
}: {
  channelKey: string | null;
  windowMs?: number;
  width?: number;
  height?: number;
  useRaw?: boolean;
  enabled?: boolean;
}) {
  const { samples } = useLiveSamples(channelKey, windowMs, enabled);
  const getY = useRaw ? (s: IoSample) => s.r : (s: IoSample) => s.v;
  const { pts } = pointsFor(samples, getY, width, height, 3);

  return (
    <View style={[styles.spark, { width, height }]}>
      {pts ? (
        <Svg width={width} height={height}>
          <Polyline points={pts} fill="none" stroke={LINE} strokeWidth={1.5}
            strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}

// ── Static graph for a fixed set of samples (recording detail) ─────────────────

export function SampleGraph({
  samples, unit, useRaw = false, height = 200,
}: {
  samples: IoSample[];
  unit: LoadCellUnit;
  useRaw?: boolean;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  return (
    <ChartBody samples={samples} unit={unit} useRaw={useRaw} height={height}
      width={width} onWidth={setWidth} empty="No samples in range" />
  );
}

// ── Live graph (recording / calibrate screen) ──────────────────────────────────

export function IoHistoryGraph({
  channelKey, windowMs = 15000, height = 200, unit, useRaw = false, enabled = true, onLatest,
}: {
  channelKey: string | null;
  windowMs?: number;
  height?: number;
  unit: LoadCellUnit;
  useRaw?: boolean;
  enabled?: boolean;
  onLatest?: (s: IoSample | null) => void;
}) {
  const { samples, latest } = useLiveSamples(channelKey, windowMs, enabled);
  const [width, setWidth] = useState(0);

  useEffect(() => { onLatest?.(latest); }, [latest, onLatest]);

  return (
    <ChartBody samples={samples} unit={unit} useRaw={useRaw} height={height}
      width={width} onWidth={setWidth} empty="Waiting for samples…" />
  );
}

// Shared chart body: trace + min/max axis labels, measures its own width.
function ChartBody({
  samples, unit, useRaw, height, width, onWidth, empty,
}: {
  samples: IoSample[];
  unit: LoadCellUnit;
  useRaw: boolean;
  height: number;
  width: number;
  onWidth: (w: number) => void;
  empty: string;
}) {
  const getY = useRaw ? (s: IoSample) => s.r : (s: IoSample) => s.v;
  const { pts, minY, maxY } = pointsFor(samples, getY, width, height, 8);
  const fmt = (v: number) => (useRaw ? Math.round(v).toString() : formatLoadCell(v, unit));

  return (
    <View style={[styles.graph, { height }]} onLayout={e => onWidth(e.nativeEvent.layout.width)}>
      {width > 0 && pts ? (
        <>
          <Svg width={width} height={height}>
            <SvgLine x1={0} y1={height / 2} x2={width} y2={height / 2}
              stroke={colors.border} strokeWidth={1} strokeDasharray="3 5" />
            <Polyline points={pts} fill="none" stroke={LINE} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
          <Text style={[styles.axis, styles.axisTop]}>{fmt(maxY)}</Text>
          <Text style={[styles.axis, styles.axisBottom]}>{fmt(minY)}</Text>
        </>
      ) : (
        <View style={styles.emptyWrap}><Text style={type.caption}>{empty}</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  spark: { alignItems: "center", justifyContent: "center" },
  graph: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  axis: {
    position: "absolute",
    right: spacing.sm,
    fontSize: 10,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  axisTop: { top: 4 },
  axisBottom: { bottom: 4 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
