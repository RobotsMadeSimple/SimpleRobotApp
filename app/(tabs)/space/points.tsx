import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { Point } from "@/src/models/robotModels";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { Button, colors, Divider, FormRow, Input, radii, SegmentedControl, shadows, spacing, type } from "@/src/components/ui/kit";
import { useFocusEffect } from "expo-router";
import {
  MapPin,
  Navigation,
  OctagonX,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  LayoutRectangle,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [movingFromPage, setMovingFromPage] = useState(false);
  const [movingToName, setMovingToName] = useState<string | null>(null);
  const [alreadyHere, setAlreadyHere] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", x: "", y: "", z: "", rz: "" });

  // Move speed — reuses the jog Slow/Normal/Fast speeds from robot config.
  const [moveSpeeds, setMoveSpeeds] = useState<{ Slow: number; Normal: number; Fast: number } | undefined>(undefined);
  const [selectedSpeed, setSelectedSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");

  useFocusEffect(
    useCallback(() => {
      robotClient.getRobotConfig()
        .then(cfg => setMoveSpeeds({ Slow: cfg.jogSlowSpeed, Normal: cfg.jogNormalSpeed, Fast: cfg.jogFastSpeed }))
        .catch(() => {});
    }, [])
  );

  const AT_THRESHOLD = 0.5;

  function isAtPoint(p: Point) {
    if (!robot) return false;
    const s = robot.status;
    return (
      Math.abs(s.x - p.x) < AT_THRESHOLD &&
      Math.abs(s.y - p.y) < AT_THRESHOLD &&
      Math.abs(s.z - p.z) < AT_THRESHOLD
    );
  }

  useEffect(() => {
    if (movingFromPage && !robot?.status.moving) {
      setMovingFromPage(false);
      setMovingToName(null);
    }
  }, [robot?.status.moving]);

  useEffect(() => { setConfirmDelete(false); }, [selectedPoint]);

  function closeMenu() {
    setSelectedPoint(null);
    setConfirmDelete(false);
  }

  function moveL() {
    if (!selectedPoint) return;
    if (isAtPoint(selectedPoint)) { setAlreadyHere(true); return; }
    setMovingToName(selectedPoint.name);
    robotClient.sendCommand("MoveL", { name: selectedPoint.name, speed: moveSpeeds?.[selectedSpeed] });
    closeMenu();
    setMovingFromPage(true);
  }

  function moveJ() {
    if (!selectedPoint) return;
    if (isAtPoint(selectedPoint)) { setAlreadyHere(true); return; }
    setMovingToName(selectedPoint.name);
    robotClient.sendCommand("MoveJ", { name: selectedPoint.name, speed: moveSpeeds?.[selectedSpeed] });
    closeMenu();
    setMovingFromPage(true);
  }

  function openEdit() {
    if (!selectedPoint) return;
    setEditDraft({
      name: selectedPoint.name,
      x: selectedPoint.x.toString(),
      y: selectedPoint.y.toString(),
      z: selectedPoint.z.toString(),
      rz: selectedPoint.rz.toString(),
    });
    setEditVisible(true);
  }

  function saveEdit() {
    if (!selectedPoint) return;
    const fields: Record<string, any> = {};
    const newName = editDraft.name.trim();
    if (newName && newName !== selectedPoint.name) fields.newName = newName;
    const px = parseFloat(editDraft.x);
    const py = parseFloat(editDraft.y);
    const pz = parseFloat(editDraft.z);
    const prz = parseFloat(editDraft.rz);
    if (!isNaN(px))  fields.x  = px;
    if (!isNaN(py))  fields.y  = py;
    if (!isNaN(pz))  fields.z  = pz;
    if (!isNaN(prz)) fields.rz = prz;
    robotClient.editPoint(selectedPoint.name, fields);
    setEditVisible(false);
    closeMenu();
  }

  function deletePoint() {
    if (!selectedPoint) return;
    robotClient.deletePoint(selectedPoint.name);
    closeMenu();
  }

  const renderItem = ({ item }: { item: Point }) => (
    <Pressable onPress={() => setSelectedPoint(item)}>
      <View style={styles.row}>
        <Text style={[styles.cell, styles.name]}>{item.name}</Text>
        <Text style={styles.cell}>{item.x.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.y.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.z.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.rz.toFixed(1)}</Text>
      </View>
    </Pressable>
  );

  const Header = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.headerCell, styles.name]}>Name</Text>
      <Text style={styles.headerCell}>X</Text>
      <Text style={styles.headerCell}>Y</Text>
      <Text style={styles.headerCell}>Z</Text>
      <Text style={styles.headerCell}>RZ</Text>
    </View>
  );

  // Speed selector + table — right pane in wide mode, stacked below the map on phones.
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

  const pointsList = (
    <FlatList
      data={points}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      ListHeaderComponent={Header}
      stickyHeaderIndices={[0]}
      contentContainerStyle={[styles.list, wideContent]}
      ListEmptyComponent={
        <Text style={styles.empty}>No points available</Text>
      }
    />
  );

  return (
    <View style={styles.page}>
      <NotConnectedOverlay />
      <SubPageHeader title="Points" />

      {isWide ? (
        /* ── Wide layout: map fills the left half, speed + table on the right ── */
        <View style={styles.wideRow}>
          <View style={styles.mapPane}>
            <PointsMap points={points} onPointPress={setSelectedPoint} fill />
          </View>
          <View style={styles.listPane}>
            {speedBarEl}
            {pointsList}
          </View>
        </View>
      ) : (
        <>
          <PointsMap points={points} onPointPress={setSelectedPoint} />
          {/* Move speed selector — applies to Line/Joint moves triggered from this page */}
          {speedBarEl}
          {pointsList}
        </>
      )}

      {/* Point options modal */}
      <Modal
        visible={!!selectedPoint}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <MapPin size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={styles.dialogTitle}>{selectedPoint?.name}</Text>
              </View>
              <Pressable onPress={closeMenu} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Text style={styles.coordText}>
              X {selectedPoint?.x.toFixed(1)}{"  "}
              Y {selectedPoint?.y.toFixed(1)}{"  "}
              Z {selectedPoint?.z.toFixed(1)}{"  "}
              RZ {selectedPoint?.rz.toFixed(1)}
            </Text>

            <Divider style={styles.divider} />

            {!confirmDelete ? (
              <>
                <Pressable style={styles.actionRow} onPress={moveL}>
                  <Navigation size={18} color={colors.accent} />
                  <Text style={styles.actionText}>Line Move</Text>
                </Pressable>
                <Pressable style={styles.actionRow} onPress={moveJ}>
                  <RotateCw size={18} color={colors.accent} />
                  <Text style={styles.actionText}>Joint Move</Text>
                </Pressable>
                <Pressable style={styles.actionRow} onPress={openEdit}>
                  <Pencil size={18} color={colors.accent} />
                  <Text style={styles.actionText}>Edit Point</Text>
                </Pressable>
                <AnimatedPressable style={styles.actionRow} onPress={() => setConfirmDelete(true)}>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={styles.deleteActionText}>Delete</Text>
                </AnimatedPressable>
              </>
            ) : (
              <>
                <Text style={styles.confirmText}>
                  Delete <Text style={{ fontWeight: "700" }}>{selectedPoint?.name}</Text>? This cannot be undone.
                </Text>
                <View style={styles.confirmButtons}>
                  <Button label="Cancel" variant="secondary" style={styles.confirmBtn} onPress={() => setConfirmDelete(false)} />
                  <Button
                    label="Delete"
                    variant="destructive"
                    style={styles.confirmBtn}
                    icon={<Trash2 size={15} color={colors.onAccent} />}
                    onPress={deletePoint}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move stop overlay */}
      <Modal visible={movingFromPage} transparent animationType="fade">
        <View style={styles.stopOverlay}>
          <View style={styles.stopCard}>
            <Navigation size={28} color={colors.accent} />
            <Text style={styles.stopTitle}>Moving to point</Text>
            {movingToName && <Text style={styles.stopPointName}>{movingToName}</Text>}
            <Button
              label="STOP"
              variant="destructive"
              icon={<OctagonX size={22} color={colors.onAccent} />}
              onPress={() => {
                robotClient.sendCommand("HardStop");
                setMovingFromPage(false);
                setMovingToName(null);
              }}
              style={styles.stopButton}
              textStyle={styles.stopButtonText}
            />
          </View>
        </View>
      </Modal>

      {/* Edit Point modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.overlay} onPress={() => setEditVisible(false)}>
            <Pressable style={styles.editCard} onPress={() => {}}>
              <View style={styles.editHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Pencil size={16} color={colors.textMuted} />
                  <Text style={styles.editTitle}>Edit Point</Text>
                </View>
                <Pressable onPress={() => setEditVisible(false)} hitSlop={10}>
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
                <Button label="Cancel" variant="secondary" style={styles.editBtn} onPress={() => setEditVisible(false)} />
                <Button label="Save" variant="primary" style={styles.editBtn} onPress={saveEdit} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Already at position popup */}
      <Modal visible={alreadyHere} transparent animationType="fade" onRequestClose={() => setAlreadyHere(false)}>
        <Pressable style={styles.overlay} onPress={() => setAlreadyHere(false)}>
          <Pressable style={styles.alreadyHereCard} onPress={() => {}}>
            <MapPin size={28} color={colors.accent} />
            <Text style={styles.alreadyHereTitle}>Already Here</Text>
            <Text style={styles.alreadyHereBody}>
              The robot is already at{"\n"}
              <Text style={{ fontWeight: "700" }}>{selectedPoint?.name}</Text>
            </Text>
            <Button label="OK" variant="primary" style={styles.alreadyHereButton} onPress={() => setAlreadyHere(false)} />
          </Pressable>
        </Pressable>
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

  // ── Points table ──────────────────────────────────────────────────────────
  list: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  headerCell: {
    flex: 1,
    fontWeight: "600",
    fontSize: 13,
    color: colors.text,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cell: {
    ...type.mono,
    flex: 1,
    textAlign: "center",
    color: colors.text,
    fontSize: 13,
  },
  name: {
    flex: 2,
    textAlign: "left",
    paddingLeft: spacing.xs + 2,
  },
  empty: {
    textAlign: "center",
    marginTop: spacing.xxl + spacing.sm,
    color: colors.textFaint,
  },

  // ── Point options dialog ─────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  dialog: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.lg + 2,
    ...shadows.raised,
  },
  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  dialogTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  coordText: {
    ...type.mono,
    fontSize: 11,
    color: colors.textFaint,
    marginBottom: spacing.md + 2,
  },
  divider: {
    marginBottom: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.background,
  },
  actionText: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: "500",
  },
  deleteActionText: {
    fontSize: 15,
    color: colors.danger,
    fontWeight: "500",
  },
  confirmText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginVertical: spacing.md,
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  confirmBtn: {
    flex: 1,
  },

  // ── Move stop overlay ─────────────────────────────────────────────────────
  stopOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  stopCard: {
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.raised,
  },
  stopTitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  stopPointName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stopButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl - 4,
    marginTop: spacing.sm,
  },
  stopButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },

  // ── Already-here popup ───────────────────────────────────────────────────
  alreadyHereCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.xs + 2,
    ...shadows.raised,
  },
  alreadyHereTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xs,
  },
  alreadyHereBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  alreadyHereButton: {
    paddingHorizontal: spacing.xl - 4,
    marginTop: spacing.xs,
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
