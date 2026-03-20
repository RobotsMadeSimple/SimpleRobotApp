import { Point } from "@/src/models/robotModels";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  MapPin,
  MousePointerClick,
  Navigation,
  OctagonX,
  RotateCw,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  LayoutRectangle,
  Modal,
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
  const scale = useSharedValue(1);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedFocalX = useSharedValue(0);
  const savedFocalY = useSharedValue(0);
  const centerX = useSharedValue(0);
  const centerY = useSharedValue(0);
  const isPinching = useSharedValue(false);

  // Tap position stored as state so we can detect in JS
  const [tapPos, setTapPos] = useState<{ x: number; y: number } | null>(null);

  // Keep refs to shared values so the tap effect can read them synchronously
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

    // Invert the transform: screen → world
    const worldX = (tapPos.x - cx - curOffX) / curScale;
    const worldY = -(tapPos.y - cy - curOffY) / curScale;

    // Hit threshold in world units
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

  // Pan: 1-finger only so it doesn't fight with pinch translation
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(6)
    .onStart(() => {
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
    })
    .onUpdate((e) => {
      if (isPinching.value) {
        // Keep saved in sync so pan resumes cleanly after pinch
        savedOffsetX.value = offsetX.value - e.translationX;
        savedOffsetY.value = offsetY.value - e.translationY;
        return;
      }
      offsetX.value = savedOffsetX.value + e.translationX;
      offsetY.value = savedOffsetY.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      isPinching.value = true;
      savedScale.value = scale.value;
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
      savedFocalX.value = e.focalX;
      savedFocalY.value = e.focalY;
    })
    .onEnd(() => {
      isPinching.value = false;
    })
    .onUpdate((e) => {
      const newScale = Math.max(0.05, Math.min(20, savedScale.value * e.scale));
      // World point that was under the start focal — keep it under the current focal
      const childX = (savedFocalX.value - centerX.value - savedOffsetX.value) / savedScale.value;
      const childY = (savedFocalY.value - centerY.value - savedOffsetY.value) / savedScale.value;
      offsetX.value = e.focalX - centerX.value - childX * newScale;
      offsetY.value = e.focalY - centerY.value - childY * newScale;
      scale.value = newScale;
    });

  // Tap: Race with pan/pinch so that any panning cancels the tap gesture
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
            {/* Axis lines */}
            <View style={styles.axisH} />
            <View style={styles.axisV} />

            {/* Point dots */}
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
                    <PointLabel
                      name={p.name}
                      cx={cx}
                      cy={cy}
                      scale={scale}
                    />
                  </View>
                );
              })}

            {/* Robot current position marker */}
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

      {/* Robot position readout */}
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

      {/* Corner hint */}
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

  const AT_THRESHOLD = 0.5; // mm — within this distance counts as "already there"

  function isAtPoint(p: Point) {
    if (!robot) return false;
    const s = robot.status;
    return (
      Math.abs(s.x - p.x) < AT_THRESHOLD &&
      Math.abs(s.y - p.y) < AT_THRESHOLD &&
      Math.abs(s.z - p.z) < AT_THRESHOLD
    );
  }

  // Dismiss the stop overlay once the robot finishes moving
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

  function reteach() {
    if (!selectedPoint) return;
    robotClient.sendCommand("TeachPoint", { name: selectedPoint.name });
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

      <Modal
        visible={!!selectedPoint}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <Pressable style={styles.dialog} onPress={() => {}}>

            {/* Header */}
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

                <Pressable style={styles.actionRow} onPress={reteach}>
                  <MousePointerClick size={18} color="#2563eb" />
                  <Text style={styles.actionText}>Re-Teach</Text>
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
            {movingToName && (
              <Text style={styles.stopPointName}>{movingToName}</Text>
            )}
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

  // ── Map ──────────────────────────────────────────────────────────────────
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: "#dde1e8",
    overflow: "hidden",
  },

  axisH: {
    position: "absolute",
    top: "50%",
    left: -9999,
    right: -9999,
    height: 1,
    backgroundColor: "#b0b8c6",
  },

  axisV: {
    position: "absolute",
    left: "50%",
    top: -9999,
    bottom: -9999,
    width: 1,
    backgroundColor: "#b0b8c6",
  },

  pointDot: {
    position: "absolute",
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: "#4ade80",
    borderWidth: 1.5,
    borderColor: "#166534",
  },

  pointLabel: {
    position: "absolute",
    width: LABEL_WIDTH,
    color: "#1f2937",
    textAlign: "center",
  },

  robotDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
    borderWidth: 2,
    borderColor: "#93c5fd",
  },

  posOverlay: {
    position: "absolute",
    top: 8,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  posText: {
    fontSize: 11,
    color: "#cbd5e1",
    fontFamily: "monospace",
  },

  posVal: {
    color: "#fff",
    fontWeight: "600",
  },

  hint: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 10,
    color: "#6b7280",
  },

  // ── List ─────────────────────────────────────────────────────────────────
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

  // ── Modal ─────────────────────────────────────────────────────────────────
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

  // ── Stop overlay ──────────────────────────────────────────────────────────
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
});
