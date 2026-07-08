import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { IORow } from "@/src/components/ui/io/ioShared";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function StbPage() {
  const status = useRobotStatus();

  const inputs = [
    { label: "Input 1", value: status.input1 },
    { label: "Input 2", value: status.input2 },
    { label: "Input 3", value: status.input3 },
    { label: "Input 4", value: status.input4 },
  ];

  const outputs = [
    { label: "Output 1", value: status.output1, idx: 1 },
    { label: "Output 2", value: status.output2, idx: 2 },
    { label: "Output 3", value: status.output3, idx: 3 },
    { label: "Output 4", value: status.output4, idx: 4 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title="STB4100"
        subtitle={`STB4100 · USB HID · ${status.driverConnected ? "Connected" : "Offline"}`}
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.sectionLabel}>INPUTS</Text>
          <View style={styles.sectionBody}>
            {inputs.map((inp, i) => (
              <IORow
                key={inp.label}
                label={inp.label}
                sublabel={`STB4100 · Input ${i + 1}`}
                type="Input"
                value={inp.value}
                last={i === inputs.length - 1}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>OUTPUTS</Text>
          <View style={styles.sectionBody}>
            {outputs.map((out, i) => (
              <IORow
                key={out.label}
                label={out.label}
                sublabel={`STB4100 · Output ${i + 1}`}
                type="Output"
                value={out.value}
                last={i === outputs.length - 1}
                onToggle={() => robotClient.setSTBOutput(out.idx, !out.value)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    color: "#6b7280", marginBottom: 6, paddingHorizontal: 16,
  },
  sectionBody: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
});
