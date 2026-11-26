import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { Point } from "@/src/models/robotModels";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Cell3DView } from "@/src/components/ui/cell3d/Cell3DView";
import type { Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import { useScreenFocused } from "@/src/components/space/space3d";
import { LAST_MOVE_SPEED_KEY, type MoveSpeedKey, PointActionSheet } from "@/src/components/space/PointActionSheet";

// The map above the list: the 2D top-down map (default) or the live 3D view. Remembered per device.
const MAP_VIEW_KEY = "points.mapView";
type MapView = "2d" | "3d" | "off";
import { Button, Card, colors, Divider, EmptyState, FormRow, InfoTip, Input, PageHeader, radii, SectionHeader, SegmentedControl, shadows, spacing, type } from "@/src/components/ui/kit";
import { useFocusEffect } from "expo-router";
import {
  ChevronRight,
  MapPin,
  Pencil,
  Search,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutRectangle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// Straight-line (translational) distance in mm from the robot to a point.
function distanceMm(p: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }): number {
  return Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
}

// The robot counts as "at" a point when every translational axis is within this many mm.
const AT_THRESHOLD = 0.5;
function isSamePoint(p: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }): boolean {
  return (
    Math.abs(p.x - s.x) < AT_THRESHOLD &&
    Math.abs(p.y - s.y) < AT_THRESHOLD &&
    Math.abs(p.z - s.z) < AT_THRESHOLD
  );
}
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// ── Blueprint palette ──────────────────────────────────────────────────────────
// This is a self-contained dark technical-blueprint visualization (canvas), not
// standard app chrome — its palette is intentional and stays outside the light
// kit tokens (see migration report). Drawing logic is untouched per scope.
const BP_BG         = "#1a3a5c";
const BP_AXIS       = "rgba(186, 230, 255, 0.85)";
const BP_GRID_MAJOR = "rgba(147, 197, 253, 0.45)";
const BP_GRID_MINOR = "rgba(147, 197, 253, 0.18)";
const GRID_MINOR_STEP = 100;
const GRID_MAJOR_STEP = 500;
const GRID_RANGE      = 2500;

const LABEL_WIDTH = 60;
const MAX_LABEL_SCREEN_PX = 11;
const BASE_LABEL_SIZE = 9;

function PointLabel({
  name,
  cx,
  cy,
  scale,
}: {
  name: string;
  cx: number;
  cy: number;
  scale: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    fontSize: Math.min(BASE_LABEL_SIZE, MAX_LABEL_SCREEN_PX / scale.value),
  }));
  return (
    <Animated.Text
      style={[
        styles.pointLabel,
        style,
        { left: cx - LABEL_WIDTH / 2, top: cy + DOT_RADIUS + 2 },
      ]}
    >
      {name}
    </Animated.Text>
  );
}

// ── Blueprint grid ─────────────────────────────────────────────────────────────

function BlueprintGrid({ cx, cy }: { cx: number; cy: number }) {
  const els: React.ReactElement[] = [];
  for (let v = -GRID_RANGE; v <= GRID_RANGE; v += GRID_MINOR_STEP) {
    if (v === 0) continue; // axes drawn separately
    const major = v % GRID_MAJOR_STEP === 0;
    const color = major ? BP_GRID_MAJOR : BP_GRID_MINOR;
    const thick = major ? 1 : StyleSheet.hairlineWidth;
    els.push(
      <View key={`h${v}`} style={{ position: "absolute", top: cy - v, left: -GRID_RANGE, width: GRID_RANGE * 2, height: thick, backgroundColor: color }} />,
      <View key={`v${v}`} style={{ position: "absolute", left: cx + v, top: -GRID_RANGE, width: thick, height: GRID_RANGE * 2, backgroundColor: color }} />
    );
  }
  return <>{els}</>;
}

const MAP_HEIGHT = 300;
const DOT_RADIUS = 6;
const HIT_THRESHOLD_PX = 28;

function PointsMap({
  points,
  onPointPress,
  fill = false,
}: {
  points: Point[];
  onPointPress: (p: Point) => void;
  /** Fill the parent instead of the fixed map height (wide-mode left pane). */
  fill?: boolean;
}) {
  const robot = useSelectedRobot();
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale   = useSharedValue(1);

  const savedScale   = useSharedValue(1);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);
  const savedFocalX  = useSharedValue(0);
  const savedFocalY  = useSharedValue(0);
  const centerX      = useSharedValue(0);
  const centerY      = useSharedValue(0);
  const isPinching   = useSharedValue(false);

  // Delta-based pan: tracks the previous finger position each frame so that
  // when the pinch ends and pan resumes, there is no accumulated-offset snap.
  const lastPanX = useSharedValue(0);
  const lastPanY = useSharedValue(0);

  const [tapPos, setTapPos] = useState<{ x: number; y: number } | null>(null);

  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);
  const scaleRef = useRef(scale);

  useEffect(() => {
    if (!tapPos || !layout) {
      setTapPos(null);
      return;
    }
    const cx = layout.width / 2;
    const cy = layout.height / 2;
    const curScale = scaleRef.current.value;
    const curOffX = offsetXRef.current.value;
    const curOffY = offsetYRef.current.value;

    const worldX = (tapPos.x - cx - curOffX) / curScale;
    const worldY = -(tapPos.y - cy - curOffY) / curScale;

    const threshold = HIT_THRESHOLD_PX / curScale;
    let closest: Point | null = null;
    let minDist = threshold;
    for (const p of points) {
      const d = Math.sqrt((p.x - worldX) ** 2 + (p.y - worldY) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
    setTapPos(null);
    if (closest) onPointPress(closest);
  }, [tapPos]);

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(6)
    .onStart((e) => {
      lastPanX.value = e.x;
      lastPanY.value = e.y;
    })
    .onUpdate((e) => {
      if (isPinching.value) {
        // Keep position synced while pinching so the first post-pinch delta is tiny
        lastPanX.value = e.x;
        lastPanY.value = e.y;
        return;
      }
      offsetX.value += e.x - lastPanX.value;
      offsetY.value += e.y - lastPanY.value;
      lastPanX.value = e.x;
      lastPanY.value = e.y;
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      isPinching.value   = true;
      savedScale.value   = scale.value;
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
      savedFocalX.value  = e.focalX;
      savedFocalY.value  = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = Math.max(0.05, Math.min(20, savedScale.value * e.scale));
      // Pin the world point that was under the initial focal
      const childX = (savedFocalX.value - centerX.value - savedOffsetX.value) / savedScale.value;
      const childY = (savedFocalY.value - centerY.value - savedOffsetY.value) / savedScale.value;
      offsetX.value = savedFocalX.value - centerX.value - childX * newScale;
      offsetY.value = savedFocalY.value - centerY.value - childY * newScale;
      scale.value = newScale;
    })
    .onEnd(() => {
      isPinching.value = false;
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((e) => {
      runOnJS(setTapPos)({ x: e.x, y: e.y });
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  // Web: scroll-wheel zoom anchored at the cursor — pins the world point under
  // the pointer exactly like the pinch gesture pins its focal point.
  const containerRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = containerRef.current;
    if (!node?.addEventListener) return;
    const onWheel = (we: WheelEvent) => {
      we.preventDefault();
      const rect = node.getBoundingClientRect();
      const fx = we.clientX - rect.left;
      const fy = we.clientY - rect.top;
      const cur  = scale.value;
      const next = Math.max(0.05, Math.min(20, cur * Math.exp(-we.deltaY * 0.0015)));
      const childX = (fx - centerX.value - offsetX.value) / cur;
      const childY = (fy - centerY.value - offsetY.value) / cur;
      offsetX.value = fx - centerX.value - childX * next;
      offsetY.value = fy - centerY.value - childY * next;
      scale.value = next;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      ref={containerRef}
      style={[styles.mapContainer, fill && styles.mapContainerFill]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout(e.nativeEvent.layout);
        centerX.value = width / 2;
        centerY.value = height / 2;
      }}
    >
      <GestureDetector gesture={composed}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            {layout && <BlueprintGrid cx={layout.width / 2} cy={layout.height / 2} />}
            <View style={styles.axisH} />
            <View style={styles.axisV} />

            {layout &&
              points.map((p) => {
                const cx = layout.width / 2 + p.x;
                const cy = layout.height / 2 - p.y;
                return (
                  <View key={p.name}>
                    <View
                      style={[
                        styles.pointDot,
                        { left: cx - DOT_RADIUS, top: cy - DOT_RADIUS },
                      ]}
                    />
                    <PointLabel name={p.name} cx={cx} cy={cy} scale={scale} />
                  </View>
                );
              })}

            {layout && robot && (
              <View
                style={[
                  styles.robotDot,
                  {
                    left: layout.width / 2 + robot.status.x - 7,
                    top: layout.height / 2 - robot.status.y - 7,
                  },
                ]}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      {robot && (
        <View style={styles.posOverlay}>
          <Text style={styles.posText}>
            X <Text style={styles.posVal}>{(robot.status.x ?? 0).toFixed(1)}</Text>
            {"  "}Y <Text style={styles.posVal}>{(robot.status.y ?? 0).toFixed(1)}</Text>
            {"  "}Z <Text style={styles.posVal}>{(robot.status.z ?? 0).toFixed(1)}</Text>
            {"  "}RZ <Text style={styles.posVal}>{(robot.status.rz ?? 0).toFixed(1)}</Text>
          </Text>
          {(() => {
            const atPoint = points.find((p) => isSamePoint(p, robot.status));
            return atPoint ? (
              <Text style={styles.posPointName} numberOfLines={1}>
                ◎ At {atPoint.name}
              </Text>
            ) : null;
          })()}
        </View>
      )}

      <Text style={styles.hint}>
        {Platform.OS === "web"
          ? "Scroll to zoom · drag to pan · click a point"
          : "Pinch to zoom · drag to pan · tap a point"}
      </Text>
    </View>
  );
}

export default function PointsPage() {
  const points = usePoints();
  const robot = useSelectedRobot();
  const isWide = useIsWide();
  const wideContent = useWideContent();
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [search, setSearch] = useState("");
  // The point being edited (the edit modal), separate from the action sheet's point.
  const [editTarget, setEditTarget] = useState<Point | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", x: "", y: "", z: "", rz: "" });

  // Move speed (Slow / Normal / Fast from the jog config) for moves from the action sheet.
  const [selectedSpeed, setSelectedSpeed] = useState<MoveSpeedKey>("Normal");

  // Default the move speed to the user's current jog speed selection (persisted from Jog & Teach).
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(LAST_MOVE_SPEED_KEY)
        .then((v) => { if (v === "Slow" || v === "Normal" || v === "Fast") setSelectedSpeed(v); })
        .catch(() => {});
    }, [])
  );

  // "off" hides the map entirely so the list gets the whole page.
  const [mapView, setMapView] = useState<MapView>("2d");
  useEffect(() => {
    AsyncStorage.getItem(MAP_VIEW_KEY).then(v => { if (v === "2d" || v === "3d" || v === "off") setMapView(v); }).catch(() => {});
  }, []);
  const chooseMapView = (v: MapView) => { setMapView(v); AsyncStorage.setItem(MAP_VIEW_KEY, v).catch(() => {}); };
  // The viewer mounts only while this screen is focused (a page on top keeps an empty box).
  const focused = useScreenFocused();
  // A tapped 3D marker opens the same action sheet as a tapped 2D dot (matched by stable id); a tap
  // on empty space closes it.
  const onPick3d = useCallback((t: Cell3DTarget | null) => {
    setSelectedPoint(t?.kind === "point" ? points.find(q => q.id === t.id) ?? null : null);
  }, [points]);

  function isAtPoint(p: Point) {
    return !!robot && isSamePoint(p, robot.status);
  }

  function openEdit(p: Point) {
    setEditDraft({ name: p.name, x: p.x.toString(), y: p.y.toString(), z: p.z.toString(), rz: p.rz.toString() });
    setSelectedPoint(null);
    setEditTarget(p);
  }

  function saveEdit() {
    if (!editTarget) return;
    const fields: Record<string, any> = {};
    const newName = editDraft.name.trim();
    if (newName && newName !== editTarget.name) fields.newName = newName;
    const px = parseFloat(editDraft.x);
    const py = parseFloat(editDraft.y);
    const pz = parseFloat(editDraft.z);
    const prz = parseFloat(editDraft.rz);
    if (!isNaN(px))  fields.x  = px;
    if (!isNaN(py))  fields.y  = py;
    if (!isNaN(pz))  fields.z  = pz;
    if (!isNaN(prz)) fields.rz = prz;
    robotClient.editPoint(editTarget.name, fields);
    setEditTarget(null);
  }

  // Speed selector + list — right pane in wide mode, stacked below the map on phones.
  const speedBarEl = (
    <View style={[styles.speedBar, wideContent]}>
      <Text style={styles.speedBarLabel}>SPEED</Text>
      <SegmentedControl
        options={["Slow", "Normal", "Fast"] as const}
        value={selectedSpeed}
        onChange={setSelectedSpeed}
        size="sm"
        style={styles.speedSegRow}
      />
    </View>
  );

  // Card-based list matching the other Space pages (Tools/Locals): a row per point with its
  // name, coordinates and straight-line distance from the robot's current position.
  const filteredPoints = points.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const pointsList = (
    <ScrollView
      style={styles.listScroll}
      contentContainerStyle={[styles.list, wideContent]}
      keyboardShouldPersistTaps="handled"
    >
      <SectionHeader title="Saved points" icon={MapPin} />

      {points.length > 0 && (
        <View style={styles.searchRow}>
          <Search size={16} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search points…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={10} style={styles.searchClear}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {points.length === 0 ? (
        <EmptyState
          icon={<MapPin size={28} color={colors.textFaint} />}
          title="No points saved yet"
          subtitle="Jog the robot to a position, then save it as a point from Jog & Teach."
        />
      ) : filteredPoints.length === 0 ? (
        <Text style={styles.noMatch}>No points match “{search.trim()}”</Text>
      ) : (
        <Card padded={false}>
          {filteredPoints.map((p, i) => {
            const here = isAtPoint(p);
            return (
              <View key={p.name}>
                <Pressable style={[styles.pointRow, here && styles.pointRowActive]} onPress={() => setSelectedPoint(p)}>
                  <View style={styles.pointInfo}>
                    <View style={styles.pointNameRow}>
                      <Text style={[styles.pointName, here && styles.pointNameActive]}>{p.name}</Text>
                      {here && (
                        <View style={styles.herePill}>
                          <Text style={styles.herePillText}>HERE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pointCoords} numberOfLines={1}>
                      X {p.x.toFixed(1)}   Y {p.y.toFixed(1)}   Z {p.z.toFixed(1)}   RZ {p.rz.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.pointRight}>
                    {robot && (
                      <Text style={[styles.pointDist, here && styles.pointDistActive]}>
                        {here ? "At point" : `${distanceMm(p, robot.status).toFixed(1)} mm`}
                      </Text>
                    )}
                    <ChevronRight size={16} color={colors.textFaint} />
                  </View>
                </Pressable>
                {i < filteredPoints.length - 1 && <Divider />}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );

  // 2D | 3D | Hide: in the header on wide screens; on phones its own slim row (the header has no
  // room for it beside the title).
  const mapViewSwitch = (
    <SegmentedControl
      size="sm"
      style={styles.mapViewToggle}
      options={[{ label: "2D", value: "2d" }, { label: "3D", value: "3d" }, { label: "Hide", value: "off" }]}
      value={mapView}
      onChange={(v) => chooseMapView(v as MapView)}
    />
  );

  return (
    <View style={styles.page}>
      <NotConnectedOverlay />
      <PageHeader
        title="Points"
        subtitle="Move to, edit, or delete saved robot positions"
        right={
          <View style={styles.headerRight}>
            {isWide && mapViewSwitch}
            <InfoTip
              text={`Tap a point on the map or in the list to line/joint move the robot there, edit its coordinates, or delete it. ${Platform.OS === "web" ? "Scroll to zoom, drag to pan" : "Pinch to zoom, drag to pan"} the map. Switch between the 2D map and the live 3D view at the top, or hide the map to give the list the whole page.`}
            />
          </View>
        }
      />

      {!isWide && (
        <View style={styles.mapViewRow}>
          <Text style={styles.speedBarLabel}>MAP</Text>
          {mapViewSwitch}
        </View>
      )}

      {mapView === "off" ? (
        <>
          {speedBarEl}
          {pointsList}
        </>
      ) : isWide ? (
        /* ── Wide layout: map fills the left half, speed + table on the right ── */
        <View style={styles.wideRow}>
          <View style={styles.mapPane}>
            {mapView === "3d"
              ? !focused ? <View style={styles.view3dFill} /> : <Cell3DView style={styles.view3dFill} persistKey="points" options={{ points: true }}
                  highlight={selectedPoint?.id ? { kind: "point", id: selectedPoint.id } : null} onPick={onPick3d} />
              : <PointsMap points={points} onPointPress={setSelectedPoint} fill />}
          </View>
          <View style={styles.listPane}>
            {speedBarEl}
            {pointsList}
          </View>
        </View>
      ) : (
        <>
          {mapView === "3d"
            ? !focused ? <View style={styles.view3d} /> : <Cell3DView style={styles.view3d} persistKey="points" options={{ points: true }}
                highlight={selectedPoint?.id ? { kind: "point", id: selectedPoint.id } : null} onPick={onPick3d} />
            : <PointsMap points={points} onPointPress={setSelectedPoint} />}
          {/* Move speed selector — applies to Line/Joint moves triggered from this page */}
          {speedBarEl}
          {pointsList}
        </>
      )}

      {/* Point actions: move (line / joint), edit, delete — the sheet the 3D views share. */}
      <PointActionSheet
        point={selectedPoint}
        onClose={() => setSelectedPoint(null)}
        speed={selectedSpeed}
        onEdit={openEdit}
        onDelete={p => robotClient.deletePoint(p.name)}
      />

      {/* Edit Point modal */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.overlay} onPress={() => setEditTarget(null)}>
            <Pressable style={styles.editCard} onPress={() => {}}>
              <View style={styles.editHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Pencil size={16} color={colors.textMuted} />
                  <Text style={styles.editTitle}>Edit Point</Text>
                </View>
                <Pressable onPress={() => setEditTarget(null)} hitSlop={10}>
                  <X size={18} color={colors.textFaint} />
                </Pressable>
              </View>

              <FormRow label="Name" style={styles.editRow}>
                <Input
                  value={editDraft.name}
                  onChangeText={(v) => setEditDraft((d) => ({ ...d, name: v }))}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </FormRow>

              {(["x", "y", "z", "rz"] as const).map((field) => (
                <FormRow key={field} label={field.toUpperCase()} style={styles.editRow}>
                  <Input
                    style={styles.coordInput}
                    value={editDraft[field]}
                    onChangeText={(v) => setEditDraft((d) => ({ ...d, [field]: v }))}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </FormRow>
              ))}

              <View style={styles.editActions}>
                <Button label="Cancel" variant="secondary" style={styles.editBtn} onPress={() => setEditTarget(null)} />
                <Button label="Save" variant="primary" style={styles.editBtn} onPress={saveEdit} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  // ── Blueprint map canvas — intentional dark theme, left untouched ──────────
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: BP_BG,
    overflow: "hidden",
  },
  mapContainerFill: { height: "auto", flex: 1 },
  view3d: { height: MAP_HEIGHT },
  view3dFill: { flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mapViewToggle: { width: 156 },
  mapViewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },

  // ── Wide (desktop / foldable) two-pane layout ───────────────────────────────
  wideRow:  { flex: 1, flexDirection: "row" },
  mapPane:  {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border,
  },
  listPane: { flex: 1 },
  axisH: {
    position: "absolute",
    top: "50%",
    left: -9999,
    right: -9999,
    height: 1,
    backgroundColor: BP_AXIS,
  },
  axisV: {
    position: "absolute",
    left: "50%",
    top: -9999,
    bottom: -9999,
    width: 1,
    backgroundColor: BP_AXIS,
  },
  pointDot: {
    position: "absolute",
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: "#60a5fa",
    borderWidth: 1.5,
    borderColor: "#e0f2fe",
  },
  pointLabel: {
    position: "absolute",
    width: LABEL_WIDTH,
    color: "#bae6fd",
    textAlign: "center",
  },
  robotDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fbbf24",
    borderWidth: 2,
    borderColor: "#fde68a",
  },
  posOverlay: {
    position: "absolute",
    top: 8,
    left: 10,
    backgroundColor: "rgba(20, 55, 90, 0.88)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.45)",
  },
  posPointName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fde68a",
    marginTop: 3,
  },
  posText: {
    fontSize: 11,
    color: "#7dd3fc",
    fontFamily: "monospace",
  },
  posVal: {
    color: "#e0f2fe",
    fontWeight: "600",
  },
  hint: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 10,
    color: "rgba(148, 163, 184, 0.55)",
  },

  // ── Speed selector ───────────────────────────────────────────────────────────
  speedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  speedBarLabel: {
    ...type.sectionLabel,
  },
  speedSegRow: {
    flex: 1,
  },

  // ── Points list (card rows, matching Tools/Locals) ─────────────────────────
  listScroll: {
    flex: 1,
  },
  list: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    ...type.body,
    color: colors.text,
    padding: 0,
  },
  searchClear: {
    padding: 2,
  },
  noMatch: {
    ...type.body,
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  pointRowActive: {
    backgroundColor: colors.accentSoft,
  },
  pointInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pointNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pointName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  pointNameActive: {
    color: colors.accent,
  },
  herePill: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  herePillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.onAccent,
  },
  pointDistActive: {
    color: colors.accent,
  },
  pointCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
  },
  pointRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  pointDist: {
    ...type.mono,
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
  // ── Modal overlay ───────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Edit point modal ──────────────────────────────────────────────────────
  editCard: {
    width: 300,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadows.raised,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  editRow: {
    marginBottom: spacing.sm + 2,
  },
  coordInput: {
    ...type.mono,
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  editBtn: {
    flex: 1,
  },
});
