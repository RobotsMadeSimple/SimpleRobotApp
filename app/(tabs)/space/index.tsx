import { globalStyles } from "@/app/globalStyles";
import { Point } from "@/src/models/robotModels";
import { usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

const END_POSITION = 200;
function App() {
  const onLeft = useSharedValue(true);
  const position = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (onLeft.value) {
        position.value = e.translationX;
      } else {
        position.value = END_POSITION + e.translationX;
      }
    })
    .onEnd((e) => {
      if (position.value > END_POSITION / 2) {
        position.value = withTiming(END_POSITION, { duration: 100 });
        onLeft.value = false;
      } else {
        position.value = withTiming(0, { duration: 100 });
        onLeft.value = true;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.box, animatedStyle]} />
    </GestureDetector>
  );
}

function PointsMap({ points }: { points: Point[] }) {
  const size = 260;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const position = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      console.log("Pan");
      translateX.value += e.translationX;
      translateY.value += e.translationY;
    })
    .onEnd((e) => {
    });


  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));

  const maxRange = Math.max(
    100,
    ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))
  );

  const unit = (size / 2) / maxRange;

  return (
    <GestureDetector gesture={pan}>
          <Animated.View style={[styles.box, animatedStyle]}/>
    </GestureDetector>
  );
}

export default function PointsPage() {
  const points = usePoints();
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  
  function closeMenu() {
    setSelectedPoint(null);
  }

  function moveTo() {
    if (!selectedPoint) return;
    robotClient.sendCommand("MoveToPoint", { name: selectedPoint.name });
    closeMenu();
  }

  function reteach() {
    if (!selectedPoint) return;
    robotClient.sendCommand("TeachPoint", { name: selectedPoint.name });
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
    <>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.name]}>Name</Text>
        <Text style={styles.headerCell}>X</Text>
        <Text style={styles.headerCell}>Y</Text>
        <Text style={styles.headerCell}>Z</Text>
        <Text style={styles.headerCell}>RZ</Text>
      </View>
    </>
  );

  return (
    <>
      <PointsMap points={points} />
      <App></App>
      <PointsMap points={points} />
      <View style={globalStyles.container}>
        <FlatList
          data={points}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          scrollEnabled={false}
          ListHeaderComponent={Header}
          stickyHeaderIndices={[0]}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No points available</Text>
          }
        />
      </View>

      <Modal
        visible={!!selectedPoint}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <View style={styles.dialog}>
            <Text style={styles.title}>{selectedPoint?.name}</Text>

            <Pressable style={styles.button} onPress={moveTo}>
              <Text style={styles.buttonText}>Move To</Text>
            </Pressable>

            <Pressable style={styles.button} onPress={reteach}>
              <Text style={styles.buttonText}>Re-Teach</Text>
            </Pressable>

            <Pressable style={styles.cancel} onPress={closeMenu}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 120,
    width: 120,
    backgroundColor: '#b58df1',
    borderRadius: 20,
    marginBottom: 30,
  },
  list: {
    padding: 8,
  },

  headerRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
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
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },

  cell: {
    flex: 1,
    fontFamily: "monospace",
    textAlign: "center",
    color: "#000",
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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: 260,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },

  button: {
    paddingVertical: 10,
  },

  buttonText: {
    fontSize: 15,
  },

  cancel: {
    marginTop: 8,
    paddingVertical: 10,
  },

  cancelText: {
    color: "#999",
  },

  map: {
    alignSelf: "center",
    marginBottom: 12,
    backgroundColor: "#111",
    borderRadius: 8,
    overflow: "hidden"
  },

  axisVertical: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#444"
  },

  axisHorizontal: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#444"
  },

  point: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80"
  }
});