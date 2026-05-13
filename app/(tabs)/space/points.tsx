import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { Point } from "@/src/models/robotModels";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Tabs } from "expo-router";
import {
  MapPin,
  Navigation,
  OctagonX,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  LayoutRectangle,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
const BP_BG         = "#0b1d35";
const BP_AXIS       = "rgba(96, 165, 250, 0.70)";
const BP_GRID_MAJOR = "rgba(59, 130, 246, 0.28)";
const BP_GRID_MINOR = "rgba(59, 130, 246, 0.09)";
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
}: {
  points: Point[];
  onPointPress: (p: Point) => void;
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

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      style={styles.mapContainer}
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

      <Text style={styles.hint}>Pinch to zoom · drag to pan · tap a point</Text>
    </View>
  );
}

export default function PointsPage() {
  const points = usePoints();
  const robot = useSelectedRobot();
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [movingFromPage, setMovingFromPage] = useState(false);
  const [movingToName, setMovingToName] = useState<string | null>(null);
  const [alreadyHere, setAlreadyHere] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", x: "", y: "", z: "", rz: "" });

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
    robotClient.sendCommand("MoveL", { name: selectedPoint.name });
    closeMenu();
    setMovingFromPage(true);
  }

  function moveJ() {
    if (!selectedPoint) return;
    if (isAtPoint(selectedPoint)) { setAlreadyHere(true); return; }
    setMovingToName(selectedPoint.name);
    robotClient.sendCommand("MoveJ", { name: selectedPoint.name });
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

  return (
    <View style={styles.page}>
      <Tabs.Screen options={{ headerShown: false }} />
      <NotConnectedOverlay />
      <SubPageHeader title="Points" />
      <PointsMap points={points} onPointPress={setSelectedPoint} />

      <FlatList
        data={points}
        keyExtractor={(item) => item.name}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No points available</Text>
        }
      />

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
                <MapPin size={16} color="#6b7280" style={{ marginTop: 1 }} />
                <Text style={styles.dialogTitle}>{selectedPoint?.name}</Text>
              </View>
              <Pressable onPress={closeMenu} hitSlop={10}>
                <X size={18} color="#9ca3af" />
              </Pressable>
            </View>

            <Text style={styles.coordText}>
              X {selectedPoint?.x.toFixed(1)}{"  "}
              Y {selectedPoint?.y.toFixed(1)}{"  "}
              Z {selectedPoint?.z.toFixed(1)}{"  "}
              RZ {selectedPoint?.rz.toFixed(1)}
            </Text>

            <View style={styles.divider} />

            {!confirmDelete ? (
              <>
                <Pressable style={styles.actionRow} onPress={moveL}>
                  <Navigation size={18} color="#2563eb" />
                  <Text style={styles.actionText}>Line Move</Text>
                </Pressable>
                <Pressable style={styles.actionRow} onPress={moveJ}>
                  <RotateCw size={18} color="#2563eb" />
                  <Text style={styles.actionText}>Joint Move</Text>
                </Pressable>
                <Pressable style={styles.actionRow} onPress={openEdit}>
                  <Pencil size={18} color="#2563eb" />
                  <Text style={styles.actionText}>Edit Point</Text>
                </Pressable>
                <Pressable style={styles.actionRow} onPress={() => setConfirmDelete(true)}>
                  <Trash2 size={18} color="#dc2626" />
                  <Text style={styles.deleteActionText}>Delete</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.confirmText}>
                  Delete <Text style={{ fontWeight: "700" }}>{selectedPoint?.name}</Text>? This cannot be undone.
                </Text>
                <View style={styles.confirmButtons}>
                  <Pressable style={styles.confirmCancel} onPress={() => setConfirmDelete(false)}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.confirmDelete} onPress={deletePoint}>
                    <Trash2 size={15} color="white" />
                    <Text style={styles.confirmDeleteText}>Delete</Text>
                  </Pressable>
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
            <Navigation size={28} color="#2563eb" />
            <Text style={styles.stopTitle}>Moving to point</Text>
            {movingToName && <Text style={styles.stopPointName}>{movingToName}</Text>}
            <Pressable
              style={styles.stopButton}
              onPress={() => {
                robotClient.sendCommand("HardStop");
                setMovingFromPage(false);
                setMovingToName(null);
              }}
            >
              <OctagonX size={22} color="white" />
              <Text style={styles.stopButtonText}>STOP</Text>
            </Pressable>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pencil size={16} color="#6b7280" />
                  <Text style={styles.editTitle}>Edit Point</Text>
                </View>
                <Pressable onPress={() => setEditVisible(false)} hitSlop={10}>
                  <X size={18} color="#9ca3af" />
                </Pressable>
              </View>

              <Text style={styles.editLabel}>Name</Text>
              <TextInput
                style={styles.editInput}
                value={editDraft.name}
                onChangeText={(v) => setEditDraft((d) => ({ ...d, name: v }))}
                autoCapitalize="none"
                returnKeyType="next"
              />

              {(["x", "y", "z", "rz"] as const).map((field) => (
                <View key={field}>
                  <Text style={styles.editLabel}>{field.toUpperCase()}</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editDraft[field]}
                    onChangeText={(v) => setEditDraft((d) => ({ ...d, [field]: v }))}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </View>
              ))}

              <View style={styles.editActions}>
                <Pressable style={styles.editCancel} onPress={() => setEditVisible(false)}>
                  <Text style={styles.editCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.editSave} onPress={saveEdit}>
                  <Text style={styles.editSaveText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Already at position popup */}
      <Modal visible={alreadyHere} transparent animationType="fade" onRequestClose={() => setAlreadyHere(false)}>
        <Pressable style={styles.overlay} onPress={() => setAlreadyHere(false)}>
          <Pressable style={styles.alreadyHereCard} onPress={() => {}}>
            <MapPin size={28} color="#2563eb" />
            <Text style={styles.alreadyHereTitle}>Already Here</Text>
            <Text style={styles.alreadyHereBody}>
              The robot is already at{"\n"}
              <Text style={{ fontWeight: "700" }}>{selectedPoint?.name}</Text>
            </Text>
            <Pressable style={styles.alreadyHereButton} onPress={() => setAlreadyHere(false)}>
              <Text style={styles.alreadyHereButtonText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#fff",
  },

  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: BP_BG,
    overflow: "hidden",
  },
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
    backgroundColor: "#3b82f6",
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
  },
  pointLabel: {
    position: "absolute",
    width: LABEL_WIDTH,
    color: "#93c5fd",
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
    backgroundColor: "rgba(11, 29, 53, 0.88)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.35)",
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

  list: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#fff",
  },
  headerCell: {
    flex: 1,
    fontWeight: "600",
    fontSize: 13,
    color: "#000",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  cell: {
    flex: 1,
    fontFamily: "monospace",
    textAlign: "center",
    color: "#000",
    fontSize: 13,
  },
  name: {
    flex: 2,
    textAlign: "left",
    paddingLeft: 6,
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#888",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialog: {
    width: 280,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dialogTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  coordText: {
    fontSize: 11,
    color: "#9ca3af",
    fontFamily: "monospace",
    marginBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  actionText: {
    fontSize: 15,
    color: "#2563eb",
    fontWeight: "500",
  },
  deleteActionText: {
    fontSize: 15,
    color: "#dc2626",
    fontWeight: "500",
  },
  confirmText: {
    fontSize: 14,
    color: "#374151",
    marginVertical: 12,
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  confirmCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmCancelText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "500",
  },
  confirmDelete: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
  },
  confirmDeleteText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  stopOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  stopCard: {
    width: 240,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  stopTitle: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600",
    marginTop: 4,
  },
  stopPointName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginTop: 8,
  },
  stopButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },

  alreadyHereCard: {
    width: 220,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  alreadyHereTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginTop: 4,
  },
  alreadyHereBody: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  alreadyHereButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 36,
    marginTop: 4,
  },
  alreadyHereButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },

  editCard: {
    width: 300,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  editLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111",
    backgroundColor: "#f9fafb",
    marginBottom: 12,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  editCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  editCancelText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "500",
  },
  editSave: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  editSaveText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
