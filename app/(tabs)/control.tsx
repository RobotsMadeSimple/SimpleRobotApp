import JogPad from "@/src/components/ui/JogPad";
import {
  History,
  MousePointerClick,
  Move3d,
  Rotate3d,
} from "lucide-react-native";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
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
        <Move3d size={18} color="#666" />
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


export default function Control() {
  const [local, setLocal] = useState("Global");
  const [tool, setTool] = useState("Hand1");
  const [selectedStep, setSelectedStep] = useState("1mm");
  const [mode, setMode] = useState("XYZ");

  const stepButtons = ["0.1mm", "1mm", "10mm", "Slow", "Normal", "Fast"];

  return (
    <View style={styles.container}>
      {/* Row 1 */}
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


      {/* Row 2 */}
      <View style={styles.row}>
        {stepButtons.map((label) => {
          const selected = selectedStep === label;
          return (
            <Pressable
              key={label}
              onPress={() => setSelectedStep(label)}
              style={[
                styles.grayButton,
                selected && styles.redSelected,
              ]}
            >
              <Text
                style={[
                  styles.grayText,
                  selected && styles.whiteText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Row 3 */}
      <View style={styles.row}>
        <Pressable
          onPress={() => setMode("XYZ")}
          style={[
            styles.grayButton,
            mode === "XYZ" && styles.redSelected,
          ]}
        >
          <Move3d
            size={16}
            color={mode === "XYZ" ? "white" : "#666"}
          />
          <Text
            style={[
              styles.grayText,
              mode === "XYZ" && styles.whiteText,
            ]}
          >
            XYZ
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("Joint")}
          style={[
            styles.grayButton,
            mode === "Joint" && styles.redSelected,
          ]}
        >
          <Rotate3d
            size={16}
            color={mode === "Joint" ? "white" : "#666"}
          />
          <Text
            style={[
              styles.grayText,
              mode === "Joint" && styles.whiteText,
            ]}
          >
            Joint
          </Text>
        </Pressable>
      </View>

      {/* Row 4 */}
      <View style={styles.row4}>
        <Text>
          <Text style={styles.axisLabel}>x:</Text>{" "}
          <Text style={styles.axisValue}>1234.0</Text>
        </Text>
        <Text>
          <Text style={styles.axisLabel}>y:</Text>{" "}
          <Text style={styles.axisValue}>1234.0</Text>
        </Text>
        <Text>
          <Text style={styles.axisLabel}>z:</Text>{" "}
          <Text style={styles.axisValue}>1234.0</Text>
        </Text>
      </View>

      {/* Center JogPad */}
      <View style={styles.jogWrapper}>
        <JogPad />
      </View>

      {/* Bottom Left History */}
      <Pressable style={styles.bottomLeft}>
        <Text style={styles.grayText}>History </Text>
        <History size={16} color="#666" />
      </Pressable>

      {/* Bottom Right Teach */}
      <Pressable style={styles.bottomRight}>
        <Text style={styles.redText}>Teach </Text>
        <MousePointerClick size={16} color="red" />
      </Pressable>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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

  picker: {
    width: 120,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 12,
  },

  row4: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: 12,
  },

  jogWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  grayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 6,
  },

  redSelected: {
    backgroundColor: "red",
    borderColor: "red",
  },

  grayText: {
    color: "#666",
    fontSize: 14,
  },

  whiteText: {
    color: "white",
  },

  axisLabel: {
    color: "#666",
  },

  axisValue: {
    color: "#000",
  },

  bottomLeft: {
    position: "absolute",
    bottom: 20,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  bottomRight: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "red",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  redText: {
    color: "red",
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

});
