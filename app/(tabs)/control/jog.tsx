import JogPad from "@/src/components/ui/JogPad";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  MousePointerClick,
  Move,
  Move3d,
  OctagonX,
  Plus,
  Rotate3d,
  Search,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

function Selector({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: "relative" }}>
      <View style={styles.selectorGroup}>
        <Move3d size={22} color="#666" />
        <Text style={styles.selectorLabel}>{label}</Text>
        <Pressable
          onPress={() => setOpen(!open)}
          style={styles.selectorButton}
        >
          <Text style={styles.grayText}>{value}</Text>
        </Pressable>
      </View>

      {open && (
        <View style={styles.dropdown}>
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => {
                onSelect(opt);
                setOpen(false);
              }}
              style={styles.dropdownItem}
            >
              <Text style={styles.grayText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function TeachModal({ onClose }: { onClose: () => void }) {
  const points = usePoints();
  const [mode, setMode] = useState<"list" | "new">("list");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const filtered = points.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function teachPoint(name: string) {
    robotClient.sendCommand("TeachPoint", { name });
    onClose();
  }

  function teachNew() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    robotClient.sendCommand("TeachPoint", { name: trimmed });
    onClose();
  }

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable style={styles.dialog} onPress={() => {}}>
        {/* Header */}
        <View style={styles.dialogHeader}>
          <Text style={styles.dialogTitle}>
            {mode === "list" ? "Teach Point" : "New Point"}
          </Text>
          <Pressable onPress={onClose}>
            <X size={20} color="#666" />
          </Pressable>
        </View>

        {mode === "list" ? (
          <>
            <View style={styles.searchRow}>
              <Search size={16} color="#aaa" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search points…"
                placeholderTextColor="#aaa"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.pointList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 && (
                <Text style={styles.emptyText}>
                  {points.length === 0 ? "No points saved yet" : "No matches"}
                </Text>
              )}
              {filtered.map((p) => (
                <Pressable
                  key={p.name}
                  style={styles.pointRow}
                  onPress={() => teachPoint(p.name)}
                >
                  <Text style={styles.pointName}>{p.name}</Text>
                  <Text style={styles.pointCoords}>
                    {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.newPointButton} onPress={() => setMode("new")}>
              <Plus size={18} color="#2563eb" />
              <Text style={styles.newPointText}>New Point</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.inputLabel}>Point name</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. PickUp1"
              placeholderTextColor="#aaa"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={teachNew}
            />
            <View style={styles.newPointActions}>
              <Pressable style={styles.backButton} onPress={() => setMode("list")}>
                <Text style={styles.backButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.teachConfirmButton, !newName.trim() && styles.disabled]}
                onPress={teachNew}
                disabled={!newName.trim()}
              >
                <MousePointerClick size={16} color="white" />
                <Text style={styles.teachConfirmText}>Teach Here</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

export default function JogScreen() {
  const [local, setLocal] = useState("Global");
  const [tool, setTool] = useState("Hand1");
  const [selectedSpeed, setSelectedSpeed] = useState("Slow");
  const [mode, setMode] = useState("XYZ");
  const [teachOpen, setTeachOpen] = useState(false);
  const robot = useSelectedRobot();

  const format = (v: number) => (v ?? 0).toFixed(1);
  const speedOptions = ["0.1mm", "1mm", "10mm", "Slow", "Normal", "Fast"];

  return (
    <View style={styles.container}>
      {/* Row 1 - Local and Tool Selection */}
      <View style={styles.row1}>
        <Selector
          label="Local:"
          value={local}
          options={["Global", "Local1"]}
          onSelect={setLocal}
        />
        <Selector
          label="Tool:"
          value={tool}
          options={["Hand1", "Hand2"]}
          onSelect={setTool}
        />
      </View>

      {/* Row 2 - Speed Selections */}
      <View style={styles.row}>
        {speedOptions.map((label) => {
          const selected = selectedSpeed === label;
          return (
            <Pressable
              key={label}
              onPress={() => setSelectedSpeed(label)}
              style={[styles.speedButton, selected && styles.redSelected]}
            >
              <Text style={[styles.speedText, selected && styles.whiteText]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Row 3 - Jog Mode */}
      <View style={styles.row}>
        <Pressable
          onPress={() => setMode("XYZ")}
          style={[styles.moveSpaceButton, mode === "XYZ" && styles.redSelected]}
        >
          <Move size={20} color={mode === "XYZ" ? "white" : "#666"} />
          <Text style={[styles.grayText, mode === "XYZ" && styles.whiteText]}>XYZ</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("Tool")}
          style={[styles.moveSpaceButton, mode === "Tool" && styles.redSelected]}
        >
          <Move size={20} color={mode === "Tool" ? "white" : "#666"} />
          <Text style={[styles.grayText, mode === "Tool" && styles.whiteText]}>Tool</Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("Joint")}
          style={[styles.moveSpaceButton, mode === "Joint" && styles.redSelected]}
        >
          <Rotate3d size={20} color={mode === "Joint" ? "white" : "#666"} />
          <Text style={[styles.grayText, mode === "Joint" && styles.whiteText]}>Joint</Text>
        </Pressable>
      </View>

      {/* Row 4 - Position View */}
      <View style={styles.row4}>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>X</Text>
          <Text style={styles.axisValue}>{format(robot?.status.x ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>Y</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.y ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>Z</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.z ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>RZ</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.rz ?? 0)}</Text>
        </View>
      </View>

      {/* JogPad */}
      <View style={styles.jogWrapper}>
        <JogPad jogMode={mode} selectedSpeed={selectedSpeed} />
      </View>

      {/* Teach row above stop */}
      <View style={styles.teachRow}>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.teachButton} onPress={() => setTeachOpen(true)}>
          <Text style={styles.teachButtonText}>Teach </Text>
          <MousePointerClick size={20} color="red" />
        </Pressable>
      </View>

      {/* Stop Button */}
      <Pressable
        style={styles.stopButton}
        onPress={() => robotClient.sendCommand("HardStop")}
      >
        <OctagonX size={26} color="white" />
        <Text style={styles.stopText}>STOP</Text>
      </Pressable>

      {/* Teach Modal */}
      <Modal visible={teachOpen} transparent animationType="fade" onRequestClose={() => setTeachOpen(false)}>
        <TeachModal key={teachOpen ? "open" : "closed"} onClose={() => setTeachOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: "stretch",
  },

  row1: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },

  selectorGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  selectorLabel: {
    color: "#666",
    fontSize: 16,
  },

  selectorButton: {
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 6,
  },

  dropdown: {
    position: "absolute",
    top: 36,
    right: 0,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "white",
    borderRadius: 6,
    elevation: 4,
    zIndex: 100,
  },

  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },

  row4: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: 20,
  },

  speedButton: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 6,
    width: "16%",
  },

  moveSpaceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 25,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 60,
  },

  redSelected: {
    backgroundColor: "red",
    borderColor: "red",
  },

  grayText: {
    color: "#666",
    fontSize: 18,
  },

  speedText: {
    color: "#666",
    fontSize: 15,
  },

  whiteText: {
    color: "white",
  },

  axisBlock: {
    alignItems: "center",
    flex: 1,
  },

  axisLabel: {
    color: "#666",
    fontSize: 18,
    marginBottom: 4,
  },

  axisValue: {
    color: "#000",
    fontSize: 22,
    fontFamily: "Courier",
    textAlign: "center",
    width: 90,
  },

  jogWrapper: {
    flex: 1,
    paddingTop: 30,
    alignItems: "center",
  },

  teachRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  teachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "red",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  teachButtonText: {
    color: "red",
    fontSize: 18,
    fontWeight: "600",
  },

  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "red",
    borderRadius: 8,
    paddingVertical: 16,
    marginBottom: 16,
  },

  stopText: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 2,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: 300,
    maxHeight: 420,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },

  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  dialogTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    backgroundColor: "#f9f9f9",
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111",
    padding: 0,
  },

  pointList: {
    maxHeight: 200,
  },

  pointRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },

  pointName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },

  pointCoords: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
    marginTop: 2,
  },

  emptyText: {
    color: "#aaa",
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 14,
  },

  newPointButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
    marginTop: 4,
  },

  newPointText: {
    fontSize: 15,
    color: "#2563eb",
    fontWeight: "600",
  },

  inputLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
  },

  textInput: {
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111",
    marginBottom: 16,
  },

  newPointActions: {
    flexDirection: "row",
    gap: 10,
  },

  backButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },

  backButtonText: {
    color: "#444",
    fontSize: 15,
  },

  teachConfirmButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "red",
    borderRadius: 8,
    paddingVertical: 11,
  },

  teachConfirmText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },

  disabled: {
    opacity: 0.4,
  },
});
