import { wide } from "@/src/components/ui/responsive";
import {
  SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { useBuiltPrograms,
  useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { CncSpec,
  ProgramStep,
  THREAD_PRESETS } from "@/src/models/robotModels";
import { router,
  useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  Check,
  ChevronDown,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  } from "lucide-react-native";
import React,
  { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import DxfParser from "dxf-parser";
import {
  Contour,
  Pt,
  boundsOf,
  chainContours,
  contourToSvgPath,
  dedupeContours,
  orientContour,
  simplifyContours,
  totalLength,
  totalPoints,
  transformContours,
} from "@/src/cnc/contours";
import { svgToContours } from "@/src/cnc/svgContours";
import { dxfToContours } from "@/src/cnc/dxfContours";
import { ContourOffsetMode, offsetContours } from "@/src/cnc/offsetContours";

// ── Types ─────────────────────────────────────────────────────────────────────

type DxfHole = {
  x: number;
  y: number;
  radius: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDxf(content: string): DxfHole[] {
  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(content);
    if (!dxf || !dxf.entities) return [];
    return (dxf.entities as any[])
      .filter((e: any) => e.type === "CIRCLE")
      .map((e: any) => ({
        x: e.center?.x ?? 0,
        y: e.center?.y ?? 0,
        radius: e.radius ?? 1,
      }));
  } catch {
    return [];
  }
}

function computeBounds(holes: DxfHole[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (holes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of holes) {
    minX = Math.min(minX, h.x - h.radius);
    minY = Math.min(minY, h.y - h.radius);
    maxX = Math.max(maxX, h.x + h.radius);
    maxY = Math.max(maxY, h.y + h.radius);
  }
  return { minX, minY, maxX, maxY };
}

// ── Numeric input ─────────────────────────────────────────────────────────────

function NumericInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  placeholder?: string;
  style?: any;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");
  const lastValid = useRef<number | undefined>(value);

  useEffect(() => {
    if (value !== undefined && value !== lastValid.current) {
      setText(String(value));
      lastValid.current = value;
    }
  }, [value]);

  return (
    <TextInput
      style={[s.input, style]}
      value={text}
      onChangeText={v => {
        if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) {
          setText(v);
          // Commit live — otherwise a value typed just before Save is lost
          // because the input never blurred.
          const n = parseFloat(v);
          if (!isNaN(n)) {
            lastValid.current = n;
            onChange(n);
          }
        }
      }}
      onBlur={() => {
        // Blur only cleans up incomplete text ("", "-", "1.") back to the
        // last valid value — committing already happened while typing.
        const n = parseFloat(text);
        if (isNaN(n)) {
          setText(lastValid.current !== undefined ? String(lastValid.current) : "");
        }
      }}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
      placeholder={placeholder}
    />
  );
}

// ── Variable-capable numeric input ────────────────────────────────────────────
// Accepts a plain number or a $variable expression (e.g. "$penZ + 1") that the
// robot evaluates at run time. Numbers commit live like NumericInput.

function VarInput({
  value,
  expr,
  onChange,
  onExpr,
  placeholder,
  style,
}: {
  value: number | undefined;
  expr: string | undefined;
  onChange: (n: number) => void;
  onExpr: (e: string | undefined) => void;
  placeholder?: string;
  style?: any;
}) {
  const [text, setText] = useState(expr ?? (value !== undefined ? String(value) : ""));
  const lastValid = useRef<number | undefined>(value);

  useEffect(() => {
    if (expr != null) { setText(expr); return; }
    if (value !== undefined && value !== lastValid.current) {
      setText(String(value));
      lastValid.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, expr]);

  return (
    <TextInput
      style={[s.input, expr != null && s.inputExpr, style]}
      value={text}
      onChangeText={v => {
        setText(v);
        const trimmed = v.trim();
        if (/^-?\d*\.?\d*$/.test(trimmed)) {
          const n = parseFloat(trimmed);
          if (!isNaN(n)) {
            lastValid.current = n;
            onChange(n);
          }
          onExpr(undefined);
        } else if (trimmed.length > 0) {
          onExpr(trimmed);
        }
      }}
      onBlur={() => {
        const trimmed = text.trim();
        if (/^-?\d*\.?\d*$/.test(trimmed) && isNaN(parseFloat(trimmed))) {
          setText(lastValid.current !== undefined ? String(lastValid.current) : "");
        }
      }}
      autoCapitalize="none"
      autoCorrect={false}
      selectTextOnFocus
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

// ── Collapsible section & compact field row ───────────────────────────────────
// The parameter list got long; sections collapse to a single row showing a
// live summary of their values, and fields sit label-left / input-right.

function Section({
  title,
  summary,
  initOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  initOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initOpen);
  return (
    <View style={s.card}>
      <TouchableOpacity style={s.secHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Text style={s.secTitle}>{title}</Text>
        <Text style={s.secSummary} numberOfLines={1}>{open ? "" : summary ?? ""}</Text>
        <ChevronDown size={16} color="#9ca3af" style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </TouchableOpacity>
      {open && <View style={s.secBody}>{children}</View>}
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldRowLabel}>{label}</Text>
      <View style={s.fieldRowInput}>{children}</View>
    </View>
  );
}

// ── CNC Viewport — contours + holes in one view, with pan / pinch / wheel zoom ─

const VIEWPORT_SIZE = 320;
const VIEWPORT_PADDING = 16;

type PlacedHole = { x: number; y: number; r: number };

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function ContourViewport({
  contours,
  selected,
  holes,
  selectedHoles,
  onTap,
  overlay,
  toolpath,
  origin,
}: {
  contours: Contour[];
  selected: Set<number>;
  /** Hole positions/radii in robot space — shown with the part outline. */
  holes: PlacedHole[];
  selectedHoles: Set<number>;
  /** Tap near a feature → its kind + index, plus the tap position in robot coords. */
  onTap: (kind: "contour" | "hole", idx: number, world: Pt) => void;
  /** Offset toolpath drawn dashed on top of the source contours. */
  overlay?: Contour[];
  /** Final directed toolpath — start dots and direction triangles come from this. */
  toolpath?: Contour[];
  /** Toolpath origin marker (robot coords). */
  origin?: { x: number; y: number; label: string };
}) {
  // Manual view from pan/zoom gestures; null = auto-fit everything.
  const viewRef = useRef<{ cx: number; cy: number; pxPerMm: number } | null>(null);
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);

  const bounds = useMemo(() => {
    let b = boundsOf(overlay && overlay.length > 0 ? [...contours, ...overlay] : contours);
    for (const h of holes) {
      const hb = { minX: h.x - h.r, maxX: h.x + h.r, minY: h.y - h.r, maxY: h.y + h.r };
      b = b == null ? hb : {
        minX: Math.min(b.minX, hb.minX), maxX: Math.max(b.maxX, hb.maxX),
        minY: Math.min(b.minY, hb.minY), maxY: Math.max(b.maxY, hb.maxY),
      };
    }
    if (b && origin) {
      b = {
        minX: Math.min(b.minX, origin.x), maxX: Math.max(b.maxX, origin.x),
        minY: Math.min(b.minY, origin.y), maxY: Math.max(b.maxY, origin.y),
      };
    }
    return b;
  }, [contours, overlay, holes, origin]);

  const fitView = useMemo(() => {
    if (!bounds) return { cx: 0, cy: 0, pxPerMm: 1 };
    const padded = VIEWPORT_SIZE - VIEWPORT_PADDING * 2;
    const w = bounds.maxX - bounds.minX || 1;
    const h = bounds.maxY - bounds.minY || 1;
    return {
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      pxPerMm: Math.min(padded / w, padded / h),
    };
  }, [bounds]);
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  const view = viewRef.current ?? fitView;
  const toX = (x: number) => VIEWPORT_SIZE / 2 + (x - view.cx) * view.pxPerMm;
  const toY = (y: number) => VIEWPORT_SIZE / 2 - (y - view.cy) * view.pxPerMm;

  // Latest props for gesture handlers (PanResponder closures are created once)
  const dataRef = useRef({ contours, holes, onTap });
  dataRef.current = { contours, holes, onTap };

  const currentView = () => viewRef.current ?? fitViewRef.current;

  function zoomAt(sx: number, sy: number, factor: number) {
    const cur = currentView();
    const next = Math.max(0.02, Math.min(400, cur.pxPerMm * factor));
    // Pin the world point under the cursor
    const wx = cur.cx + (sx - VIEWPORT_SIZE / 2) / cur.pxPerMm;
    const wy = cur.cy - (sy - VIEWPORT_SIZE / 2) / cur.pxPerMm;
    viewRef.current = {
      pxPerMm: next,
      cx: wx - (sx - VIEWPORT_SIZE / 2) / next,
      cy: wy + (sy - VIEWPORT_SIZE / 2) / next,
    };
    bump();
  }

  function handleTapAt(sx: number, sy: number) {
    const cur = currentView();
    const { contours: cs, holes: hs, onTap: cb } = dataRef.current;
    const tX = (x: number) => VIEWPORT_SIZE / 2 + (x - cur.cx) * cur.pxPerMm;
    const tY = (y: number) => VIEWPORT_SIZE / 2 - (y - cur.cy) * cur.pxPerMm;

    // Nearest hole (distance to its edge) vs nearest contour segment
    let holeIdx = -1, holeD = 16;
    hs.forEach((h, i) => {
      const d = Math.hypot(tX(h.x) - sx, tY(h.y) - sy) - Math.max(h.r * cur.pxPerMm, 6);
      if (d < holeD) { holeD = d; holeIdx = i; }
    });
    let cIdx = -1, cD = 16;
    cs.forEach((c, i) => {
      for (let j = 1; j < c.points.length; j++) {
        const d = distToSegment(
          sx, sy,
          tX(c.points[j - 1].x), tY(c.points[j - 1].y),
          tX(c.points[j].x), tY(c.points[j].y),
        );
        if (d < cD) { cD = d; cIdx = i; }
      }
    });

    const world = {
      x: cur.cx + (sx - VIEWPORT_SIZE / 2) / cur.pxPerMm,
      y: cur.cy - (sy - VIEWPORT_SIZE / 2) / cur.pxPerMm,
    };
    if (holeIdx >= 0 && holeD <= cD) cb("hole", holeIdx, world);
    else if (cIdx >= 0) cb("contour", cIdx, world);
  }

  // Drag = pan, two fingers = pinch zoom, small movement = tap
  const gRef = useRef({ moved: false, lastX: 0, lastY: 0, downX: 0, downY: 0, pinch: 0 });
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt: any) => {
      const g = gRef.current;
      g.moved = false;
      g.pinch = 0;
      g.lastX = g.downX = evt.nativeEvent.locationX;
      g.lastY = g.downY = evt.nativeEvent.locationY;
    },
    onPanResponderMove: (evt: any) => {
      const g = gRef.current;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        const dist = Math.hypot(
          touches[0].pageX - touches[1].pageX,
          touches[0].pageY - touches[1].pageY,
        );
        if (g.pinch > 0 && dist > 0) {
          const cur = currentView();
          viewRef.current = { ...cur, pxPerMm: Math.max(0.02, Math.min(400, cur.pxPerMm * (dist / g.pinch))) };
          bump();
        }
        g.pinch = dist;
        g.moved = true;
        return;
      }
      g.pinch = 0;
      const x = evt.nativeEvent.locationX, y = evt.nativeEvent.locationY;
      if (!g.moved && Math.hypot(x - g.downX, y - g.downY) > 5) g.moved = true;
      if (g.moved) {
        const dx = x - g.lastX, dy = y - g.lastY;
        if (dx !== 0 || dy !== 0) {
          const cur = currentView();
          viewRef.current = { ...cur, cx: cur.cx - dx / cur.pxPerMm, cy: cur.cy + dy / cur.pxPerMm };
          bump();
        }
      }
      g.lastX = x;
      g.lastY = y;
    },
    onPanResponderRelease: (evt: any) => {
      if (!gRef.current.moved) handleTapAt(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
  })).current;

  // Web: scroll-wheel zoom anchored at the cursor
  const wrapRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = wrapRef.current;
    if (!node?.addEventListener) return;
    const onWheel = (we: WheelEvent) => {
      we.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomAt(we.clientX - rect.left, we.clientY - rect.top, Math.exp(-we.deltaY * 0.0015));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bounds || (contours.length === 0 && holes.length === 0)) {
    return (
      <View style={s.emptyViewport}>
        <Text style={s.emptyViewportText}>No contours or holes found in file</Text>
      </View>
    );
  }

  // Direction triangles along a toolpath contour (screen space)
  function arrowsFor(c: Contour): { x: number; y: number; a: number }[] {
    const pts = c.points.map(p => ({ x: toX(p.x), y: toY(p.y) }));
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      lens.push(l);
      total += l;
    }
    if (total < 26) return [];
    const fracs = total < 90 ? [0.5] : [0.18, 0.5, 0.82];
    const out: { x: number; y: number; a: number }[] = [];
    for (const f of fracs) {
      let remain = total * f;
      for (let i = 0; i < lens.length; i++) {
        if (remain > lens[i]) { remain -= lens[i]; continue; }
        const t = lens[i] < 1e-9 ? 0 : remain / lens[i];
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
        const y = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        out.push({ x, y, a: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x) });
        break;
      }
    }
    return out;
  }

  const trianglePath = (x: number, y: number, a: number) => {
    const cos = Math.cos(a), sin = Math.sin(a);
    const tipX = x + 5 * cos,           tipY = y + 5 * sin;
    const lX   = x - 3 * cos - 3 * sin, lY  = y - 3 * sin + 3 * cos;
    const rX   = x - 3 * cos + 3 * sin, rY  = y - 3 * sin - 3 * cos;
    return `M ${tipX.toFixed(1)} ${tipY.toFixed(1)} L ${lX.toFixed(1)} ${lY.toFixed(1)} L ${rX.toFixed(1)} ${rY.toFixed(1)} Z`;
  };

  return (
    <View ref={wrapRef} style={s.viewport} {...responder.panHandlers}>
      <Svg width={VIEWPORT_SIZE} height={VIEWPORT_SIZE}>
        <Rect x={0} y={0} width={VIEWPORT_SIZE} height={VIEWPORT_SIZE} fill="#f8fafc" />

        {/* Origin marker */}
        {origin && (
          <G>
            <Line x1={toX(origin.x) - 9} y1={toY(origin.y)} x2={toX(origin.x) + 9} y2={toY(origin.y)}
              stroke="#0891b2" strokeWidth={1.25} />
            <Line x1={toX(origin.x)} y1={toY(origin.y) - 9} x2={toX(origin.x)} y2={toY(origin.y) + 9}
              stroke="#0891b2" strokeWidth={1.25} />
            <Circle cx={toX(origin.x)} cy={toY(origin.y)} r={3.5}
              fill="none" stroke="#0891b2" strokeWidth={1.25} />
            <SvgText x={toX(origin.x) + 7} y={toY(origin.y) - 7} fill="#0891b2" fontSize={9} fontWeight="700">
              {origin.label}
            </SvgText>
          </G>
        )}

        {/* Part outline */}
        {contours.map((c, i) => {
          const isSelected = selected.has(i);
          return (
            <Path
              key={i}
              d={contourToSvgPath(c, toX, toY)}
              fill="none"
              stroke={isSelected ? "#7c3aed" : "#c7d2fe"}
              strokeWidth={isSelected ? 2 : 1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Holes — amber when selected for drilling/threading */}
        {holes.map((h, i) => {
          const isSelected = selectedHoles.has(i);
          const r = Math.max(h.r * view.pxPerMm, 4);
          return (
            <G key={`h${i}`}>
              <Circle
                cx={toX(h.x)} cy={toY(h.y)} r={r}
                fill={isSelected ? "rgba(217,119,6,0.14)" : "none"}
                stroke={isSelected ? "#d97706" : "#94a3b8"}
                strokeWidth={isSelected ? 2 : 1.25}
                strokeDasharray={isSelected ? undefined : "3 3"}
              />
              {isSelected && <Circle cx={toX(h.x)} cy={toY(h.y)} r={2} fill="#d97706" />}
            </G>
          );
        })}

        {/* Offset toolpath — dashed, drawn over the source contours */}
        {(overlay ?? []).map((c, i) => (
          <Path
            key={`o${i}`}
            d={contourToSvgPath(c, toX, toY)}
            fill="none"
            stroke="#059669"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Direction triangles + start dots from the final directed toolpath */}
        {(toolpath ?? []).map((c, i) => (
          <G key={`t${i}`}>
            {arrowsFor(c).map((ar, j) => (
              <Path key={j} d={trianglePath(ar.x, ar.y, ar.a)} fill="#f97316" />
            ))}
            {c.points.length > 0 && (
              <Circle
                cx={toX(c.points[0].x)} cy={toY(c.points[0].y)} r={3.5}
                fill="#16a34a" stroke="#fff" strokeWidth={1}
              />
            )}
          </G>
        ))}
      </Svg>

      {viewRef.current != null && (
        <TouchableOpacity
          style={s.fitBtn}
          onPress={() => { viewRef.current = null; bump(); }}
          activeOpacity={0.7}
        >
          <Text style={s.fitBtnText}>Fit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CncBuilderScreen() {
  const { programName, stepId } = useLocalSearchParams<{ programName?: string; stepId?: string }>();
  const builtPrograms = useBuiltPrograms();
  const connected = useConnected();

  // ── State ─────────────────────────────────────────────────────────────────

  const [dxfFiles, setDxfFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [selectedDxf, setSelectedDxf] = useState<string | undefined>(undefined);
  const [dxfContent, setDxfContent] = useState<string | undefined>(undefined);
  const [loadingDxf, setLoadingDxf] = useState(false);

  const holes = useMemo(() => (dxfContent ? parseDxf(dxfContent) : []), [dxfContent]);
  const [selectedHoles, setSelectedHoles] = useState<Set<number>>(new Set());

  // ── Toolpath state ────────────────────────────────────────────────────────
  const isSvg = (selectedDxf ?? "").toLowerCase().endsWith(".svg");

  const [contourSel, setContourSel]   = useState<Set<number>>(new Set());
  const [scale, setScale]             = useState<number>(1);
  const [offsetX, setOffsetX]         = useState<number>(0);
  const [offsetY, setOffsetY]         = useState<number>(0);
  const [flipY, setFlipY]             = useState<boolean>(false);
  const [activeZ, setActiveZ]             = useState<number>(0);
  const [activeSpeed, setActiveSpeed]     = useState<number>(50);
  const [activeAccel, setActiveAccel]     = useState<number | undefined>(undefined);
  const [activeDecel, setActiveDecel]     = useState<number | undefined>(undefined);
  const [travelSpeed, setTravelSpeed] = useState<number | undefined>(undefined);
  const [travelAccel, setTravelAccel] = useState<number | undefined>(undefined);
  const [travelDecel, setTravelDecel] = useState<number | undefined>(undefined);
  const [blendRadius, setBlendRadius] = useState<number>(0);
  const [detail, setDetail]           = useState<number>(0.05);
  const [joinTol, setJoinTol]         = useState<number>(0.1);
  const [offsetMode, setOffsetMode]   = useState<ContourOffsetMode>("none");
  const [offsetDist, setOffsetDist]   = useState<number>(1);
  const [originMode, setOriginMode]   = useState<"absolute" | "current">("absolute");

  // Per-contour direction / start-point choices (keyed by base contour index)
  const [contourReversed, setContourReversed] = useState<Set<number>>(new Set());
  const [contourStarts, setContourStarts]     = useState<Record<string, Pt>>({});
  const [tapMode, setTapMode]                 = useState<"select" | "start" | "dir">("select");

  // $variable expressions for motion fields — evaluated on the robot at run time
  const [fieldExprs, setFieldExprs]   = useState<Record<string, string>>({});
  const setFieldExpr = (key: string) => (e: string | undefined) =>
    setFieldExprs(prev => {
      const next = { ...prev };
      if (e == null) delete next[key];
      else next[key] = e;
      return next;
    });

  const rawContours = useMemo(() => {
    if (!dxfContent) return [];
    try {
      // Purge accidental duplicate lines up front (file units)
      const parsed = isSvg ? svgToContours(dxfContent) : dxfToContours(dxfContent);
      return dedupeContours(parsed);
    } catch {
      return [];
    }
  }, [dxfContent, isSvg]);

  // Contours placed into robot space, chained, and simplified — the solid
  // shapes shown in the preview and what selection refers to. Chaining happens
  // in robot space (mm) so the join tolerance is physical and independent of
  // file units. The tool offset is applied afterwards, to the selection only.
  const baseContours = useMemo(
    () => simplifyContours(
      chainContours(
        transformContours(rawContours, { scale, offsetX, offsetY, flipY }),
        Math.max(0, joinTol),
      ),
      Math.max(0, detail),
    ),
    [rawContours, scale, offsetX, offsetY, flipY, joinTol, detail],
  );

  // Holes placed into robot space with the SAME normalization as the contours,
  // so they sit correctly on the part outline in the preview and in the saved
  // spec. Falls back to hole extents when the file has no contour geometry.
  const placedHoles = useMemo<PlacedHole[]>(() => {
    if (holes.length === 0) return [];
    let b = boundsOf(rawContours);
    if (!b) {
      const hb = computeBounds(holes);
      b = hb ? { minX: hb.minX, minY: hb.minY, maxX: hb.maxX, maxY: hb.maxY } : null;
    }
    if (!b) return [];
    return holes.map(h => ({
      x: offsetX + (h.x - b!.minX) * scale,
      y: offsetY + (flipY ? (b!.maxY - h.y) : (h.y - b!.minY)) * scale,
      r: Math.abs(h.radius * scale),
    }));
  }, [holes, rawContours, scale, offsetX, offsetY, flipY]);

  // New file: SVGs are y-down so they come out mirrored without a flip — unless a
  // saved spec restored an explicit flip choice. Selection defaults to all,
  // or to the restored selection when re-entering a saved block. Keyed on the
  // contour count so placement tweaks (offset/scale) don't reset a selection,
  // while joining/detail changes that alter the count do.
  useEffect(() => {
    if (pendingFlipYRef.current != null) {
      setFlipY(pendingFlipYRef.current);
      pendingFlipYRef.current = null;
      return;
    }
    setFlipY(isSvg);
  }, [isSvg, selectedDxf]);
  useEffect(() => {
    if (baseContours.length === 0) return;
    if (pendingContourSelRef.current) {
      setContourSel(new Set(pendingContourSelRef.current.filter(i => i < baseContours.length)));
      pendingContourSelRef.current = null;
    } else {
      setContourSel(new Set(baseContours.map((_, i) => i)));
    }
    if (pendingReversedRef.current) {
      setContourReversed(new Set(pendingReversedRef.current.filter(i => i < baseContours.length)));
      pendingReversedRef.current = null;
    } else {
      setContourReversed(new Set());
    }
    if (pendingStartsRef.current) {
      setContourStarts(pendingStartsRef.current);
      pendingStartsRef.current = null;
    } else {
      setContourStarts({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseContours.length, selectedDxf]);

  // The actual toolpath: selected contours, tool offset applied per contour,
  // then re-oriented for the chosen start point and travel direction. Shown
  // dashed in the preview when offset, and what gets baked into the spec.
  const chosenContours = useMemo(() => {
    const out: Contour[] = [];
    baseContours.forEach((c, i) => {
      if (!contourSel.has(i)) return;
      const dir = { reverse: contourReversed.has(i), startNear: contourStarts[String(i)] ?? null };
      if (offsetMode === "none") {
        out.push(orientContour(c, dir));
      } else {
        for (const oc of simplifyContours(
          offsetContours([c], offsetMode, Math.max(0, offsetDist)),
          Math.max(0, detail),
        ))
          out.push(orientContour(oc, dir));
      }
    });
    return out;
  }, [baseContours, contourSel, contourReversed, contourStarts, offsetMode, offsetDist, detail]);
  const placedBounds = useMemo(() => boundsOf(chosenContours), [chosenContours]);

  // Threading params
  const [safeZ, setSafeZ] = useState<number>(5);
  const [holeOp, setHoleOp] = useState<"drill" | "thread">("thread");
  const [holeDepth, setHoleDepth] = useState<number>(-15);
  const [threadPitch, setThreadPitch] = useState<number>(1.5);
  const [holePeck, setHolePeck] = useState(false);
  const [holePeckDepth, setHolePeckDepth] = useState<number>(5);
  const [threadReverseOut, setThreadReverseOut] = useState(true);

  const [presetOpen, setPresetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Restore state from the step's saved spec (once) ──────────────────────

  const restoredRef          = useRef(false);
  const pendingHoleSelRef    = useRef<number[] | null>(null);
  const pendingContourSelRef = useRef<number[] | null>(null);
  const pendingFlipYRef      = useRef<boolean | null>(null);
  const pendingReversedRef   = useRef<number[] | null>(null);
  const pendingStartsRef     = useRef<Record<string, Pt> | null>(null);

  useEffect(() => {
    if (restoredRef.current || !programName || !stepId) return;
    const prog = builtPrograms.find(p => p.name === programName);
    if (!prog) return;
    const step = findStep(prog.steps, stepId);
    if (!step) return;
    restoredRef.current = true;

    if (step.cncDxfFile) setSelectedDxf(step.cncDxfFile);
    const spec = step.cncSpec;
    if (!spec) {
      if (step.cncSafeZ != null) setSafeZ(step.cncSafeZ);
      return;
    }

    setSafeZ(spec.safeZ ?? 5);
    if (spec.holeOp         != null) setHoleOp(spec.holeOp);
    if (spec.holeDepth      != null) setHoleDepth(spec.holeDepth);
    if (spec.threadPitch      != null) setThreadPitch(spec.threadPitch);
    if (spec.holePeck       != null) setHolePeck(spec.holePeck);
    if (spec.holePeckDepth  != null) setHolePeckDepth(spec.holePeckDepth);
    if (spec.threadReverseOut != null) setThreadReverseOut(spec.threadReverseOut);
    if (spec.scale       != null) setScale(spec.scale);
    if (spec.offsetX     != null) setOffsetX(spec.offsetX);
    if (spec.offsetY     != null) setOffsetY(spec.offsetY);
    if (spec.flipY       != null) pendingFlipYRef.current = spec.flipY;
    if (spec.activeZ       != null) setActiveZ(spec.activeZ);
    if (spec.activeSpeed   != null) setActiveSpeed(spec.activeSpeed);
    if (spec.activeAccel   != null) setActiveAccel(spec.activeAccel);
    if (spec.activeDecel   != null) setActiveDecel(spec.activeDecel);
    if (spec.travelSpeed != null) setTravelSpeed(spec.travelSpeed);
    if (spec.travelAccel != null) setTravelAccel(spec.travelAccel);
    if (spec.travelDecel != null) setTravelDecel(spec.travelDecel);
    if (spec.blendRadius != null) setBlendRadius(spec.blendRadius);
    if (spec.detail      != null) setDetail(spec.detail);
    if (spec.joinTolerance != null) setJoinTol(spec.joinTolerance);
    if (spec.offsetMode  != null) setOffsetMode(spec.offsetMode);
    if (spec.offsetDistance != null) setOffsetDist(spec.offsetDistance);
    if (spec.originMode  != null) setOriginMode(spec.originMode);
    if (spec.expressions != null) setFieldExprs(spec.expressions);
    pendingReversedRef.current = spec.contourReversed ?? null;
    pendingStartsRef.current = spec.contourStarts
      ? Object.fromEntries(Object.entries(spec.contourStarts).map(([k, v]) => [k, { x: v.x, y: v.y }]))
      : null;
    // Selections apply once the file has loaded and parsed
    pendingHoleSelRef.current    = spec.holeIndexes ?? null;
    pendingContourSelRef.current = spec.contourIndexes ?? null;
  }, [programName, stepId, builtPrograms]);

  // Apply restored hole selection once holes are parsed
  useEffect(() => {
    if (pendingHoleSelRef.current && holes.length > 0) {
      setSelectedHoles(new Set(pendingHoleSelRef.current.filter(i => i < holes.length)));
      pendingHoleSelRef.current = null;
    }
  }, [holes]);

  // ── DXF file list ────────────────────────────────────────────────────────

  const refreshFiles = useCallback(async () => {
    if (!connected) return;
    setLoadingFiles(true);
    try {
      const files = await robotClient.listDxfFiles();
      setDxfFiles(files);
    } catch {
      // silent
    } finally {
      setLoadingFiles(false);
    }
  }, [connected]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  // ── Load DXF content when selectedDxf changes ────────────────────────────

  useEffect(() => {
    if (!selectedDxf) { setDxfContent(undefined); return; }
    setLoadingDxf(true);
    robotClient.getDxfFile(selectedDxf)
      .then(txt => { setDxfContent(txt); setSelectedHoles(new Set()); })
      .catch(() => setDxfContent(undefined))
      .finally(() => setLoadingDxf(false));
  }, [selectedDxf]);

  // ── Upload DXF ────────────────────────────────────────────────────────────

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/octet-stream", "image/svg+xml", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const lower = asset.name.toLowerCase();
    const name = lower.endsWith(".dxf") || lower.endsWith(".svg") ? asset.name : asset.name + ".dxf";
    setUploading(true);
    try {
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      await robotClient.uploadDxfFile(name, content);
      await refreshFiles();
      setSelectedDxf(name);
    } catch (e: any) {
      appAlert("Upload Failed", e?.message ?? "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  // ── Delete DXF ────────────────────────────────────────────────────────────

  function handleDeleteDxf(name: string) {
    appAlert("Delete DXF", `Delete "${name}" from the controller?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await robotClient.deleteDxfFile(name);
            if (selectedDxf === name) setSelectedDxf(undefined);
            refreshFiles();
          } catch (e: any) {
            appAlert("Error", e?.message ?? "Delete failed");
          }
        }
      },
    ]);
  }

  // ── Generate and save toolpath ────────────────────────────────────────────

  async function persistSpec(prog: (typeof builtPrograms)[number], spec: CncSpec) {
    if (!stepId) return;
    const updatedSteps = updateStepInList(prog.steps, stepId, step => ({
      ...step,
      cncDxfFile: selectedDxf,
      cncSafeZ: safeZ,
      cncSpec: spec,
      // Steps are generated at runtime from the spec now — drop any baked
      // steps a previous save (or app version) left behind.
      cncProgramSteps: undefined,
    }));

    setSaving(true);
    try {
      await robotClient.saveBuiltProgram({
        ...prog,
        steps: updatedSteps,
        id: prog.id ?? "",
        variables: prog.variables ?? [],
      });
      router.back();
    } catch (e: any) {
      appAlert("Save Failed", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const round3 = (v: number) => Math.round(v * 1000) / 1000;

  async function handleSave() {
    if (!programName || !stepId) {
      appAlert("Error", "Missing program reference — reopen the CNC builder from a program step.");
      return;
    }
    const prog = builtPrograms.find(p => p.name === programName);
    if (!prog) { appAlert("Error", `Program "${programName}" not found on the robot.`); return; }
    if (!findStep(prog.steps, stepId)) {
      appAlert(
        "Step Not Saved",
        "This CNC step isn't in the robot's saved copy of the program yet. Go back, save the program, then reopen the CNC builder.",
      );
      return;
    }

    // Holes and contours save together — the block threads all selected holes,
    // then follows all selected contours.
    const orderedHoleIdx = Array.from(selectedHoles).sort((a, b) => a - b);
    const orderedHoles = orderedHoleIdx.map(i => placedHoles[i]).filter(Boolean);
    const hasHoles = orderedHoles.length > 0;
    const hasContours = chosenContours.length > 0;

    if (!hasHoles && !hasContours) {
      appAlert("Nothing Selected", "Select holes to drill or thread, and/or contours to follow.");
      return;
    }

    const points = totalPoints(chosenContours);
    if (points > 20000) {
      appAlert("Too Many Points", `The selected contours contain ${points} points. Raise the Detail tolerance or deselect contours to reduce the toolpath size.`);
      return;
    }

    const spec: CncSpec = {
      file: selectedDxf,
      safeZ,
      originMode,
      expressions: Object.keys(fieldExprs).length > 0 ? fieldExprs : undefined,
      ...(hasHoles ? {
        holes: orderedHoles.map(h => ({ x: round3(h.x), y: round3(h.y) })),
        holeIndexes: orderedHoleIdx,
        holeOp,
        holeDepth,
        threadPitch: holeOp === "thread" ? threadPitch : undefined,
        holePeck,
        holePeckDepth: holePeck ? holePeckDepth : undefined,
        threadReverseOut: holeOp === "thread" ? threadReverseOut : undefined,
      } : {}),
      ...(hasContours ? {
        paths: chosenContours.map(c => c.points.flatMap(p => [round3(p.x), round3(p.y)])),
        contourIndexes: Array.from(contourSel).sort((a, b) => a - b),
        contourReversed: contourReversed.size > 0 ? Array.from(contourReversed).sort((a, b) => a - b) : undefined,
        contourStarts: Object.keys(contourStarts).length > 0
          ? Object.fromEntries(Object.entries(contourStarts).map(([k, p]) => [k, { x: round3(p.x), y: round3(p.y) }]))
          : undefined,
        scale, offsetX, offsetY, flipY,
        activeZ, activeSpeed, activeAccel, activeDecel,
        travelSpeed, travelAccel, travelDecel,
        blendRadius, detail,
        joinTolerance: joinTol,
        offsetMode,
        offsetDistance: offsetDist,
      } : {}),
    };

    await persistSpec(prog, spec);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Holes and contours save together, so the save button reflects both.
  const selectedCount = selectedHoles.size + contourSel.size;

  return (
    <View style={s.root}>
      <SubPageHeader
        title="CNC Builder"
        subtitle={programName}
        right={
          <TouchableOpacity
            style={[s.saveBtn, (saving || selectedCount === 0) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || selectedCount === 0}
            activeOpacity={0.75}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Save  ({selectedCount})</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scroll, wide.content]}>

        {/* Vector file selector */}
        <Text style={s.sectionLabel}>VECTOR FILE (DXF / SVG)</Text>
        <View style={s.card}>
          {/* Upload button */}
          <TouchableOpacity style={s.uploadRow} onPress={handleUpload} disabled={uploading || !connected} activeOpacity={0.7}>
            {uploading ? (
              <ActivityIndicator size="small" color="#7c3aed" />
            ) : (
              <Upload size={16} color="#7c3aed" />
            )}
            <Text style={s.uploadText}>{uploading ? "Uploading…" : "Upload DXF from device"}</Text>
          </TouchableOpacity>

          {/* File list */}
          {loadingFiles ? (
            <ActivityIndicator style={{ margin: 12 }} color="#7c3aed" />
          ) : dxfFiles.length === 0 ? (
            <Text style={s.emptyHint}>No DXF files on controller. Upload one above.</Text>
          ) : (
            dxfFiles.map(name => (
              <TouchableOpacity
                key={name}
                style={[s.fileRow, selectedDxf === name && s.fileRowSelected]}
                onPress={() => setSelectedDxf(name)}
                activeOpacity={0.7}
              >
                <FileText size={15} color={selectedDxf === name ? "#7c3aed" : "#6b7280"} />
                <Text style={[s.fileName, selectedDxf === name && s.fileNameSelected]} numberOfLines={1}>{name}</Text>
                {selectedDxf === name && <Check size={14} color="#7c3aed" />}
                <DeleteIconButton size={14} onPress={() => handleDeleteDxf(name)} style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={s.refreshRow} onPress={refreshFiles} activeOpacity={0.7}>
            <RefreshCw size={13} color="#9ca3af" />
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Unified preview: part outline + holes, selection, direction, placement */}
        {selectedDxf && (
          <>
            <Text style={s.sectionLabel}>
              PREVIEW  ·  {contourSel.size}/{baseContours.length} contours · {selectedHoles.size}/{placedHoles.length} holes
            </Text>
            <View style={s.card}>
              {loadingDxf ? (
                <ActivityIndicator style={{ margin: 24 }} color="#7c3aed" />
              ) : (
                <>
                  <ContourViewport
                    contours={baseContours}
                    selected={contourSel}
                    holes={placedHoles}
                    selectedHoles={selectedHoles}
                    overlay={offsetMode !== "none" ? chosenContours : undefined}
                    toolpath={chosenContours}
                    origin={{ x: offsetX, y: offsetY, label: originMode === "current" ? "ROBOT" : "ORIGIN" }}
                    onTap={(kind, idx, world) => {
                      if (kind === "hole") {
                        // Holes only respond in Select mode — direction/start
                        // don't apply to them.
                        if (tapMode !== "select") return;
                        setSelectedHoles(prev => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                        return;
                      }
                      if (tapMode === "select") {
                        setContourSel(prev => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      } else if (tapMode === "dir") {
                        setContourReversed(prev => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      } else {
                        const c = baseContours[idx];
                        if (!c) return;
                        if (c.closed) {
                          setContourStarts(prev => ({ ...prev, [String(idx)]: world }));
                        } else {
                          // Open contour: start at whichever end was tapped
                          const first = c.points[0];
                          const last  = c.points[c.points.length - 1];
                          const d0 = Math.hypot(world.x - first.x, world.y - first.y);
                          const d1 = Math.hypot(world.x - last.x,  world.y - last.y);
                          setContourReversed(prev => {
                            const next = new Set(prev);
                            if (d1 < d0) next.add(idx);
                            else next.delete(idx);
                            return next;
                          });
                        }
                      }
                    }}
                  />

                  {/* Tap behavior */}
                  <View style={[s.segRow, { marginHorizontal: 12, marginTop: 8 }]}>
                    {([["select", "Select"], ["start", "Start Point"], ["dir", "Direction"]] as const).map(([m, label]) => (
                      <TouchableOpacity
                        key={m}
                        style={[s.segBtn, tapMode === m && s.segBtnActive]}
                        onPress={() => setTapMode(m)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.segBtnText, tapMode === m && s.segBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.hintText}>
                    {tapMode === "select"
                      ? "Tap a contour or hole to include/exclude it. Drag to pan, pinch or scroll to zoom. Triangles show travel direction; the green dot is the start."
                      : tapMode === "start"
                        ? "Tap where a closed contour should start. On open contours, tap near the end to start from."
                        : "Tap a contour to flip its travel direction."}
                  </Text>

                  <View style={s.selectionBtns}>
                    <TouchableOpacity
                      style={s.selBtn}
                      onPress={() => setContourSel(new Set(baseContours.map((_, i) => i)))}
                      activeOpacity={0.7}
                    >
                      <Text style={s.selBtnText}>All Contours</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.selBtn}
                      onPress={() => setContourSel(new Set())}
                      activeOpacity={0.7}
                    >
                      <Text style={s.selBtnText}>No Contours</Text>
                    </TouchableOpacity>
                    {placedHoles.length > 0 && (
                      <>
                        <TouchableOpacity
                          style={s.selBtn}
                          onPress={() => setSelectedHoles(new Set(placedHoles.map((_, i) => i)))}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.selBtnText, { color: "#d97706" }]}>All Holes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.selBtn}
                          onPress={() => setSelectedHoles(new Set())}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.selBtnText, { color: "#d97706" }]}>No Holes</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                  {chosenContours.length > 0 && placedBounds && (
                    <Text style={s.hintText}>
                      {totalPoints(chosenContours)} pts · path {totalLength(chosenContours).toFixed(0)} mm ·
                      output {(placedBounds.maxX - placedBounds.minX).toFixed(1)} × {(placedBounds.maxY - placedBounds.minY).toFixed(1)} mm
                      at X {placedBounds.minX.toFixed(1)}, Y {placedBounds.minY.toFixed(1)}
                    </Text>
                  )}
                </>
              )}
            </View>

            <Section
              title="Placement"
              summary={`${originMode === "current" ? "@robot · " : ""}×${scale} · (${offsetX}, ${offsetY})${flipY ? " · flip Y" : ""}${offsetMode !== "none" ? ` · ${offsetMode} ${offsetDist}mm` : ""}`}
            >
              <Text style={s.dynLabel}>ORIGIN</Text>
              <View style={[s.segRow, { marginHorizontal: 0, marginTop: 0 }]}>
                {([["absolute", "Fixed Position"], ["current", "Robot Position"]] as const).map(([m, label]) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.segBtn, originMode === m && s.segBtnActive]}
                    onPress={() => setOriginMode(m)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.segBtnText, originMode === m && s.segBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.hintSm}>
                {originMode === "current"
                  ? "The robot's position when the block runs becomes the origin — jog to where the toolpath should go, then run. Z is relative too: Active Z 0 = the height the robot starts at."
                  : "Coordinates are absolute robot positions (within the active local frame)."}
              </Text>
              <FieldRow label="Scale">
                <NumericInput value={scale} onChange={setScale} placeholder="1" style={s.inputSm} />
              </FieldRow>
              <FieldRow label={originMode === "current" ? "Offset X (mm)" : "Origin X (mm)"}>
                <NumericInput value={offsetX} onChange={setOffsetX} placeholder="0" style={s.inputSm} />
              </FieldRow>
              <FieldRow label={originMode === "current" ? "Offset Y (mm)" : "Origin Y (mm)"}>
                <NumericInput value={offsetY} onChange={setOffsetY} placeholder="0" style={s.inputSm} />
              </FieldRow>
              <Text style={s.hintSm}>
                {originMode === "current"
                  ? "Scale multiplies file units into mm; the file's lower-left corner lands this far from the robot's start position."
                  : "Scale multiplies file units into mm; origin is the robot position of the file's lower-left corner."}
              </Text>
              <FieldRow label="Flip Y">
                <TouchableOpacity
                  style={[s.toggleBtn, flipY && s.toggleBtnOn, { alignSelf: "flex-end" }]}
                  onPress={() => setFlipY(v => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.toggleBtnText, flipY && s.toggleBtnTextOn]}>{flipY ? "ON" : "OFF"}</Text>
                </TouchableOpacity>
              </FieldRow>

              <Text style={s.dynLabel}>TOOL OFFSET</Text>
              <View style={[s.segRow, { marginHorizontal: 0, marginTop: 0 }]}>
                {([["none", "None"], ["outside", "Outside"], ["inside", "Inside"]] as const).map(([m, label]) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.segBtn, offsetMode === m && s.segBtnActive]}
                    onPress={() => setOffsetMode(m)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.segBtnText, offsetMode === m && s.segBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {offsetMode !== "none" && (
                <FieldRow label="Offset distance (mm)">
                  <NumericInput value={offsetDist} onChange={setOffsetDist} placeholder="1" style={s.inputSm} />
                </FieldRow>
              )}
              <Text style={s.hintSm}>Shifts closed contours by e.g. half the tool diameter — shown dashed in the preview. Open contours are not offset.</Text>
            </Section>

            <Section
              title="Motion"
              initOpen
              summary={`Z ${fieldExprs.safeZ ?? safeZ}→${fieldExprs.activeZ ?? activeZ} · ${fieldExprs.activeSpeed ?? activeSpeed} mm/s · blend ${fieldExprs.blendRadius ?? blendRadius}`}
            >
              <FieldRow label="Safe Z (mm)">
                <VarInput value={safeZ} expr={fieldExprs.safeZ} onChange={setSafeZ} onExpr={setFieldExpr("safeZ")} placeholder="5" style={s.inputSm} />
              </FieldRow>
              <FieldRow label="Active Z (mm)">
                <VarInput value={activeZ} expr={fieldExprs.activeZ} onChange={setActiveZ} onExpr={setFieldExpr("activeZ")} placeholder="0" style={s.inputSm} />
              </FieldRow>
              <FieldRow label="Blend radius (mm)">
                <VarInput value={blendRadius} expr={fieldExprs.blendRadius} onChange={setBlendRadius} onExpr={setFieldExpr("blendRadius")} placeholder="0" style={s.inputSm} />
              </FieldRow>
              <Text style={s.hintSm}>Blend &gt; 0 runs each contour as one continuous move at full speed; 0 stops at every point. Fields accept $variable expressions.</Text>

              <Text style={s.dynLabel}>ACTIVE</Text>
              <View style={s.tripleRow}>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>SPEED</Text>
                  <VarInput value={activeSpeed} expr={fieldExprs.activeSpeed} onChange={setActiveSpeed} onExpr={setFieldExpr("activeSpeed")} placeholder="50" style={s.inputSm} />
                </View>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>ACCEL</Text>
                  <VarInput value={activeAccel} expr={fieldExprs.activeAccel} onChange={setActiveAccel} onExpr={setFieldExpr("activeAccel")} placeholder="auto" style={s.inputSm} />
                </View>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>DECEL</Text>
                  <VarInput value={activeDecel} expr={fieldExprs.activeDecel} onChange={setActiveDecel} onExpr={setFieldExpr("activeDecel")} placeholder="auto" style={s.inputSm} />
                </View>
              </View>

              <Text style={s.dynLabel}>TRAVEL (AT SAFE Z)</Text>
              <View style={s.tripleRow}>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>SPEED</Text>
                  <VarInput value={travelSpeed} expr={fieldExprs.travelSpeed} onChange={setTravelSpeed} onExpr={setFieldExpr("travelSpeed")} placeholder="auto" style={s.inputSm} />
                </View>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>ACCEL</Text>
                  <VarInput value={travelAccel} expr={fieldExprs.travelAccel} onChange={setTravelAccel} onExpr={setFieldExpr("travelAccel")} placeholder="auto" style={s.inputSm} />
                </View>
                <View style={s.tripleCell}>
                  <Text style={s.tripleLabel}>DECEL</Text>
                  <VarInput value={travelDecel} expr={fieldExprs.travelDecel} onChange={setTravelDecel} onExpr={setFieldExpr("travelDecel")} placeholder="auto" style={s.inputSm} />
                </View>
              </View>
              <Text style={s.hintSm}>On short segments speed is acceleration-limited — raise accel/decel or the blend radius if speed changes have no visible effect. "auto" = program default.</Text>
            </Section>

            {placedHoles.length > 0 && (
              <Section
                title="Holes"
                summary={`${holeOp} ${fieldExprs.holeDepth ?? holeDepth}${holeOp === "thread" ? ` · ${THREAD_PRESETS.find(p => Math.abs(p.pitch - threadPitch) < 0.001)?.label ?? `${fieldExprs.threadPitch ?? threadPitch} mm/rev`}` : ""}${holePeck ? " · peck" : ""}`}
              >
                <Text style={s.dynLabel}>OPERATION</Text>
                <View style={[s.segRow, { marginHorizontal: 0, marginTop: 0 }]}>
                  {([["drill", "Drill"], ["thread", "Thread"]] as const).map(([m, label]) => (
                    <TouchableOpacity
                      key={m}
                      style={[s.segBtn, holeOp === m && s.segBtnActive]}
                      onPress={() => setHoleOp(m)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.segBtnText, holeOp === m && s.segBtnTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.hintSm}>
                  {holeOp === "drill"
                    ? "Plunges straight down into each selected hole."
                    : "Taps each selected hole — Z and RZ move together at the pitch below."}
                </Text>

                <FieldRow label="Depth (mm)">
                  <VarInput value={holeDepth} expr={fieldExprs.holeDepth} onChange={setHoleDepth} onExpr={setFieldExpr("holeDepth")} placeholder="-15" style={s.inputSm} />
                </FieldRow>
                <Text style={s.hintSm}>Negative = down, measured from Safe Z. Accepts $variable expressions.</Text>

                {holeOp === "thread" && (
                  <>
                    <Text style={s.dynLabel}>THREAD PITCH</Text>
                    <TouchableOpacity
                      style={[s.presetBtn, { marginHorizontal: 0 }]}
                      onPress={() => setPresetOpen(v => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.presetBtnText}>
                        {THREAD_PRESETS.find(p => Math.abs(p.pitch - threadPitch) < 0.001)?.label ?? `${threadPitch} mm/rev`}
                      </Text>
                      <ChevronDown size={15} color="#7c3aed" style={{ transform: [{ rotate: presetOpen ? "180deg" : "0deg" }] }} />
                    </TouchableOpacity>
                    {presetOpen && (
                      <View style={[s.presetList, { marginHorizontal: 0 }]}>
                        {THREAD_PRESETS.map((p, i) => (
                          <TouchableOpacity
                            key={i}
                            style={[s.presetItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6" }]}
                            onPress={() => { setThreadPitch(p.pitch); setFieldExpr("threadPitch")(undefined); setPresetOpen(false); }}
                            activeOpacity={0.7}
                          >
                            <Text style={[s.presetItemText, Math.abs(p.pitch - threadPitch) < 0.001 && { color: "#7c3aed", fontWeight: "700" }]}>
                              {p.label}  <Text style={{ color: "#9ca3af" }}>{p.pitch} mm/rev</Text>
                            </Text>
                            {Math.abs(p.pitch - threadPitch) < 0.001 && <Check size={14} color="#7c3aed" />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <FieldRow label="Pitch (mm/rev)">
                      <VarInput value={threadPitch} expr={fieldExprs.threadPitch} onChange={setThreadPitch} onExpr={setFieldExpr("threadPitch")} placeholder="1.5" style={s.inputSm} />
                    </FieldRow>
                  </>
                )}

                <FieldRow label="Peck (retract between passes)">
                  <TouchableOpacity
                    style={[s.toggleBtn, holePeck && s.toggleBtnOn, { alignSelf: "flex-end" }]}
                    onPress={() => setHolePeck(v => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.toggleBtnText, holePeck && s.toggleBtnTextOn]}>{holePeck ? "ON" : "OFF"}</Text>
                  </TouchableOpacity>
                </FieldRow>
                {holePeck && (
                  <FieldRow label="Peck depth (mm)">
                    <VarInput value={holePeckDepth} expr={fieldExprs.holePeckDepth} onChange={setHolePeckDepth} onExpr={setFieldExpr("holePeckDepth")} placeholder="5" style={s.inputSm} />
                  </FieldRow>
                )}
                {holeOp === "thread" && (
                  <FieldRow label="Reverse out">
                    <TouchableOpacity
                      style={[s.toggleBtn, threadReverseOut && s.toggleBtnOn, { alignSelf: "flex-end" }]}
                      onPress={() => setThreadReverseOut(v => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.toggleBtnText, threadReverseOut && s.toggleBtnTextOn]}>{threadReverseOut ? "ON" : "OFF"}</Text>
                    </TouchableOpacity>
                  </FieldRow>
                )}
                <Text style={s.hintSm}>
                  {holeOp === "thread"
                    ? "Peck breaks chips by retracting between passes; reverse out spins RZ back to start after threading."
                    : "Peck breaks chips by retracting to Safe Z between passes."}
                </Text>
              </Section>
            )}

            <Section title="Path Quality" summary={`join ${joinTol} mm · detail ${detail} mm`}>
              <FieldRow label="Join tolerance (mm)">
                <NumericInput value={joinTol} onChange={setJoinTol} placeholder="0.1" style={s.inputSm} />
              </FieldRow>
              <Text style={s.hintSm}>Segments whose ends are within this distance chain into one tool-down pass. Raise if the tool lifts at every point.</Text>
              <FieldRow label="Detail tolerance (mm)">
                <NumericInput value={detail} onChange={setDetail} placeholder="0.05" style={s.inputSm} />
              </FieldRow>
              <Text style={s.hintSm}>Max deviation when simplifying curves. Raise to reduce point count.</Text>
            </Section>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Step tree helpers ─────────────────────────────────────────────────────────

function findStep(steps: ProgramStep[], id: string): ProgramStep | null {
  for (const s of steps) {
    if (s.id === id) return s;
    const nested = [
      ...(s.loopSteps ?? []),
      ...(s.ifSteps ?? []),
      ...(s.elseSteps ?? []),
      ...(s.cncProgramSteps ?? []),
      ...((s.elseIfBranches ?? []).flatMap(b => b.steps ?? [])),
    ];
    const found = findStep(nested, id);
    if (found) return found;
  }
  return null;
}

function updateStepInList(steps: ProgramStep[], id: string, updater: (s: ProgramStep) => ProgramStep): ProgramStep[] {
  return steps.map(s => {
    if (s.id === id) return updater(s);
    return {
      ...s,
      loopSteps:       s.loopSteps       ? updateStepInList(s.loopSteps, id, updater) : undefined,
      ifSteps:         s.ifSteps         ? updateStepInList(s.ifSteps, id, updater) : undefined,
      elseSteps:       s.elseSteps       ? updateStepInList(s.elseSteps, id, updater) : undefined,
      cncProgramSteps: s.cncProgramSteps ? updateStepInList(s.cncProgramSteps, id, updater) : undefined,
      elseIfBranches:  s.elseIfBranches  ? s.elseIfBranches.map(b => ({
        ...b,
        steps: updateStepInList(b.steps ?? [], id, updater),
      })) : undefined,
    };
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb" },
  scroll: { padding: 16 },
  modeRow: {
    flexDirection: "row", gap: 8, marginBottom: 14,
    backgroundColor: "#f3f4f6", borderRadius: 12, padding: 4,
  },
  modeBtn: {
    flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 9,
  },
  modeBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: "#9ca3af" },
  modeBtnTextActive: { color: "#7c3aed" },
  groupLabel: {
    fontSize: 12, fontWeight: "800", color: "#6b7280",
    letterSpacing: 0.6, paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6",
    paddingTop: 12,
  },
  segRow: {
    flexDirection: "row", gap: 6, marginHorizontal: 14, marginTop: 4,
    backgroundColor: "#f3f4f6", borderRadius: 10, padding: 3,
  },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  segBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  segBtnText: { fontSize: 12, fontWeight: "600", color: "#9ca3af" },
  segBtnTextActive: { color: "#7c3aed" },
  fitBtn: {
    position: "absolute", right: 8, top: 8,
    backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  fitBtnText: { fontSize: 12, fontWeight: "700", color: "#7c3aed" },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb",
    marginBottom: 18, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  uploadRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6",
  },
  uploadText: { fontSize: 14, color: "#7c3aed", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#9ca3af", padding: 14 },
  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6",
  },
  fileRowSelected: { backgroundColor: "#faf5ff" },
  fileName: { flex: 1, fontSize: 14, color: "#374151" },
  fileNameSelected: { color: "#7c3aed", fontWeight: "600" },
  refreshRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 12, justifyContent: "center",
  },
  refreshText: { fontSize: 12, color: "#9ca3af" },
  viewport: {
    alignSelf: "center",
    borderRadius: 10, overflow: "hidden",
    marginVertical: 8,
    borderWidth: 1, borderColor: "#e5e7eb",
  },
  emptyViewport: {
    height: VIEWPORT_SIZE, justifyContent: "center", alignItems: "center",
    margin: 8,
  },
  emptyViewportText: { fontSize: 13, color: "#9ca3af" },
  selectionBtns: {
    flexDirection: "row", gap: 8, padding: 12, paddingTop: 4,
  },
  selBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  selBtnText: { fontSize: 13, color: "#7c3aed", fontWeight: "600" },
  fieldLabel: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.6, marginBottom: 4, paddingHorizontal: 14,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12, color: "#9ca3af", paddingHorizontal: 14, marginTop: 2, marginBottom: 4,
  },
  input: {
    marginHorizontal: 14, borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", backgroundColor: "#f9fafb",
  },
  inputExpr: { color: "#7c3aed", fontWeight: "600", borderColor: "#ddd6fe", backgroundColor: "#faf5ff" },
  inputSm: { marginHorizontal: 0, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14 },

  // Collapsible sections
  secHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  secTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  secSummary: { flex: 1, fontSize: 12, color: "#9ca3af", textAlign: "right" },
  secBody: {
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6",
  },

  // Compact rows
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fieldRowLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151" },
  fieldRowInput: { width: 150 },
  tripleRow: { flexDirection: "row", gap: 8 },
  tripleCell: { flex: 1 },
  tripleLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.5, marginBottom: 4 },
  dynLabel: { fontSize: 11, fontWeight: "800", color: "#6b7280", letterSpacing: 0.6, marginTop: 2 },
  hintSm: { fontSize: 11, color: "#9ca3af", lineHeight: 15 },
  presetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 14, borderWidth: 1, borderColor: "#ddd6fe",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#faf5ff",
  },
  presetBtnText: { fontSize: 14, color: "#7c3aed", fontWeight: "600" },
  presetList: {
    marginHorizontal: 14, marginTop: 4,
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8,
    backgroundColor: "#fff", overflow: "hidden",
  },
  presetItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  presetItemText: { fontSize: 14, color: "#374151" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  toggleBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  toggleBtnOn: { borderColor: "#7c3aed", backgroundColor: "#faf5ff" },
  toggleBtnText: { fontSize: 13, fontWeight: "700", color: "#9ca3af" },
  toggleBtnTextOn: { color: "#7c3aed" },
  saveBtn: {
    backgroundColor: "#7c3aed", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnDisabled: { backgroundColor: "#9ca3af" },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
