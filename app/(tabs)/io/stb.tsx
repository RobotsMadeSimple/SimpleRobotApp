import { IORow } from "@/src/components/ui/io/ioShared";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import {
  Card,
  colors,
  Divider,
  PageHeader,
  Screen,
  SectionHeader,
  spacing,
  StatTile,
  StatusPill,
} from "@/src/components/ui/kit";

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

  const activeInputs  = inputs.filter(i => i.value).length;
  const activeOutputs = outputs.filter(o => o.value).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title="STB4100"
        subtitle="Robot's built-in I/O board · USB HID"
        right={
          <StatusPill
            label={status.driverConnected ? "Connected" : "Offline"}
            tone={status.driverConnected ? "success" : "danger"}
            dot
          />
        }
      />
      <Screen>
        <View style={styles.statRow}>
          <StatTile label="Inputs Active" value={`${activeInputs}/${inputs.length}`} icon={ArrowDownToLine} style={styles.statTile} />
          <StatTile label="Outputs On" value={`${activeOutputs}/${outputs.length}`} icon={ArrowUpFromLine}
                    tint={[colors.accent, colors.accentSoft]} style={styles.statTile} />
        </View>

        <SectionHeader title="Inputs" icon={ArrowDownToLine} />
        <Card padded={false}>
          {inputs.map((inp, i) => (
            <React.Fragment key={inp.label}>
              <IORow
                label={inp.label}
                sublabel={`STB4100 · Input ${i + 1}`}
                type="Input"
                value={inp.value}
              />
              {i < inputs.length - 1 && <Divider inset />}
            </React.Fragment>
          ))}
        </Card>

        <SectionHeader title="Outputs" icon={ArrowUpFromLine} />
        <Card padded={false}>
          {outputs.map((out, i) => (
            <React.Fragment key={out.label}>
              <IORow
                label={out.label}
                sublabel={`STB4100 · Output ${i + 1}`}
                type="Output"
                value={out.value}
                onToggle={() => robotClient.setSTBOutput(out.idx, !out.value)}
              />
              {i < outputs.length - 1 && <Divider inset />}
            </React.Fragment>
          ))}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow:  { flexDirection: "row", gap: spacing.md },
  statTile: { flex: 1 },
});
