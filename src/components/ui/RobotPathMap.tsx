import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Path as SvgPath } from "react-native-svg";

// Live top-down (X/Y) map for the program monitor — blueprint styling to match
// the points map, but instead of saved points it shows the robot's current
// position, the point it is moving to, and a fading trail of where it has
// been. The view auto-fits the trail + target with a minimum span so it stays
// readable when the robot is stationary.

type TrailPt = { x: number; y: number; t: number };

const TRAIL_MS   = 12000;  // trail fades out over this window
const MIN_MOVE   = 0.3;    // mm of movement before a new trail sample is kept
const MAX_TRAIL  = 500;    // hard cap on samples
const MIN_SPAN   = 40;     // mm — minimum world width/height of the view
const FIT_PAD    = 1.25;   // fit padding factor around content

const BP_BG   = "#1a3a5c";
const BP_GRID = "rgba(255,255,255,0.08)";
const BP_AXIS = "rgba(255,255,255,0.22)";

function gridStep(scale: number): number {
  // Pick a 1/2/5·10^k step that lands roughly every 40–90 px
  const target = 60 / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) return m * pow;
  }
  return 10 * pow;
}

export function RobotPathMap({
  x, y,
  targetX, targetY,
  moving,
  plannedPaths,
  plannedHoles,
  height = 230,
}: {
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  moving?: boolean;
  /** Upcoming toolpath polylines (e.g. a CNC block's contours) — drawn dotted. */
  plannedPaths?: { x: number; y: number }[][];
  /** Planned hole positions — drawn as dotted circles. */
  plannedHoles?: { x: number; y: number }[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const trailRef = useRef<TrailPt[]>([]);
  const [, forceRender] = useState(0);

  // Sample the position into the trail whenever it moves far enough
  useEffect(() => {
    const tr = trailRef.current;
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= MIN_MOVE) {
      tr.push({ x, y, t: Date.now() });
      if (tr.length > MAX_TRAIL) tr.splice(0, tr.length - MAX_TRAIL);
    }
  }, [x, y]);

  // Steady tick so the trail keeps fading while the robot is idle
  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - TRAIL_MS;
      const tr = trailRef.current;
      while (tr.length > 0 && tr[0].t < cutoff) tr.shift();
      forceRender(v => v + 1);
    }, 200);
    return () => clearInterval(iv);
  }, []);

  if (width === 0) {
    return <View style={[styles.map, { height }]} onLayout={e => setWidth(e.nativeEvent.layout.width)} />;
  }

  const now = Date.now();
  const trail = trailRef.current;
  const showTarget = !!moving && targetX != null && targetY != null;

  // ── Auto-fit view ──────────────────────────────────────────────────────────
  let minX = x, maxX = x, minY = y, maxY = y;
  if (showTarget) {
    minX = Math.min(minX, targetX!); maxX = Math.max(maxX, targetX!);
    minY = Math.min(minY, targetY!); maxY = Math.max(maxY, targetY!);
  }
  for (const p of trail) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  for (const path of plannedPaths ?? [])
    for (const p of path) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  for (const p of plannedHoles ?? []) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const cxW = (minX + maxX) / 2;
  const cyW = (minY + maxY) / 2;
  const spanX = Math.max((maxX - minX) * FIT_PAD, MIN_SPAN);
  const spanY = Math.max((maxY - minY) * FIT_PAD, MIN_SPAN);
  const scale = Math.min(width / spanX, height / spanY);

  const sx = (wx: number) => width / 2 + (wx - cxW) * scale;
  const sy = (wy: number) => height / 2 - (wy - cyW) * scale;   // world y-up → screen y-down

  // ── Grid ───────────────────────────────────────────────────────────────────
  const step = gridStep(scale);
  const gxStart = Math.ceil((cxW - width / 2 / scale) / step) * step;
  const gxEnd   = cxW + width / 2 / scale;
  const gyStart = Math.ceil((cyW - height / 2 / scale) / step) * step;
  const gyEnd   = cyW + height / 2 / scale;
  const gridLines: React.ReactElement[] = [];
  for (let gx = gxStart; gx <= gxEnd; gx += step) {
    const isAxis = Math.abs(gx) < step / 2;
    gridLines.push(
      <SvgLine key={`v${gx}`} x1={sx(gx)} y1={0} x2={sx(gx)} y2={height}
        stroke={isAxis ? BP_AXIS : BP_GRID} strokeWidth={1} />,
    );
  }
  for (let gy = gyStart; gy <= gyEnd; gy += step) {
    const isAxis = Math.abs(gy) < step / 2;
    gridLines.push(
      <SvgLine key={`h${gy}`} x1={0} y1={sy(gy)} x2={width} y2={sy(gy)}
        stroke={isAxis ? BP_AXIS : BP_GRID} strokeWidth={1} />,
    );
  }

  // ── Trail segments (older = more transparent) ──────────────────────────────
  const trailLines: React.ReactElement[] = [];
  for (let i = 1; i < trail.length; i++) {
    const age = now - trail[i].t;
    const opacity = Math.max(0, 1 - age / TRAIL_MS) * 0.85;
    if (opacity <= 0.02) continue;
    trailLines.push(
      <SvgLine key={i}
        x1={sx(trail[i - 1].x)} y1={sy(trail[i - 1].y)}
        x2={sx(trail[i].x)} y2={sy(trail[i].y)}
        stroke="#22d3ee" strokeWidth={2} strokeOpacity={opacity} strokeLinecap="round" />,
    );
  }
  // Connect the newest sample to the live position so the trail has no gap
  if (trail.length > 0) {
    const lastP = trail[trail.length - 1];
    trailLines.push(
      <SvgLine key="live"
        x1={sx(lastP.x)} y1={sy(lastP.y)} x2={sx(x)} y2={sy(y)}
        stroke="#22d3ee" strokeWidth={2} strokeOpacity={0.85} strokeLinecap="round" />,
    );
  }

  return (
    <View style={[styles.map, { height }]} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        {gridLines}

        {/* Planned toolpath — where the robot is going to go */}
        {(plannedPaths ?? []).map((path, i) => {
          if (path.length < 2) return null;
          const d = path
            .map((p, j) => `${j === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
            .join(" ");
          return (
            <SvgPath key={`pp${i}`} d={d} fill="none"
              stroke="rgba(255,255,255,0.4)" strokeWidth={1.25}
              strokeDasharray="3 4" strokeLinejoin="round" strokeLinecap="round" />
          );
        })}
        {(plannedHoles ?? []).map((p, i) => (
          <Circle key={`ph${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4}
            fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.25} strokeDasharray="2 2" />
        ))}

        {trailLines}

        {/* Target — where the robot is heading */}
        {showTarget && (
          <>
            <SvgLine x1={sx(x)} y1={sy(y)} x2={sx(targetX!)} y2={sy(targetY!)}
              stroke="#fbbf24" strokeWidth={1} strokeOpacity={0.55} strokeDasharray="4 4" />
            <Circle cx={sx(targetX!)} cy={sy(targetY!)} r={7}
              fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeOpacity={0.9} />
            <Circle cx={sx(targetX!)} cy={sy(targetY!)} r={1.8} fill="#fbbf24" />
          </>
        )}

        {/* Robot — current position */}
        <Circle cx={sx(x)} cy={sy(y)} r={9} fill="#4ade80" fillOpacity={0.18} />
        <Circle cx={sx(x)} cy={sy(y)} r={4.5} fill="#4ade80" stroke="#052e16" strokeWidth={1} />
      </Svg>

      <Text style={styles.scaleText}>{step} mm grid</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: BP_BG,
    borderRadius: 12,
    overflow: "hidden",
  },
  scaleText: {
    position: "absolute",
    right: 8,
    bottom: 6,
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
  },
});
