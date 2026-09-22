import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { IORow } from "@/src/components/ui/io/ioShared";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import React from "react";
import { View } from "react-native";

import { Card, colors, Divider, Screen, SectionHeader } from "@/src/components/ui/kit";

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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubPageHeader
        title="STB4100"
        subtitle={`STB4100 · USB HID · ${status.driverConnected ? "Connected" : "Offline"}`}
      />
      <Screen>
        <SectionHeader title="Inputs" />
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

        <SectionHeader title="Outputs" />
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
