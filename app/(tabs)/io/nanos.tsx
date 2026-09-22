import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { IORow } from "@/src/components/ui/io/ioShared";
import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoState } from "@/src/models/robotModels";
import { Settings2 } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { Button, buttonTextColor, Card, colors, Divider, EmptyState, Screen, SectionHeader } from "@/src/components/ui/kit";

function NanoDetail({ nano }: { nano: NanoState }) {
  const inputs    = nano.pins.filter(p => p.type === "Input");
  const outputs   = nano.pins.filter(p => p.type === "Output");
  const neopixels = nano.pins.filter(p => p.type === "Neopixel");

  const groups = [
    { label: "Inputs",   pins: inputs    },
    { label: "Outputs",  pins: outputs   },
    { label: "Neopixel", pins: neopixels },
  ].filter(g => g.pins.length > 0);

  if (nano.pins.length === 0) {
    return (
      <EmptyState
        title="No pins configured."
        subtitle="Tap the settings icon to configure this board."
      />
    );
  }

  return (
    <>
      {groups.map(g => (
        <View key={g.label}>
          <SectionHeader title={g.label} />
          <Card padded={false}>
            {g.pins.map((pin, i) => (
              <React.Fragment key={pin.pin}>
                <IORow
                  label={pin.name || `Pin ${pin.pin}`}
                  sublabel={`${nano.name} · D${pin.pin}`}
                  type={pin.type}
                  value={pin.value}
                  onToggle={
                    pin.type === "Output"
                      ? () => robotClient.setNanoOutput(nano.id, pin.pin, !pin.value)
                      : undefined
                  }
                />
                {i < g.pins.length - 1 && <Divider inset />}
              </React.Fragment>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

export default function NanosPage() {
  const { nanoId } = useLocalSearchParams<{ nanoId?: string }>();
  const nanos = useNanoIO();

  const nano = nanoId ? (nanos.find(n => n.id === nanoId) ?? null) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubPageHeader
        title={nano ? nano.name : "Arduino Nano"}
        subtitle={
          nano
            ? `${nano.id} · ${nano.connected ? "Connected" : "Offline"}`
            : "Device not found"
        }
        right={
          nano ? (
            <Button
              variant="secondary"
              size="sm"
              label="Configure"
              icon={<Settings2 size={15} color={buttonTextColor("secondary")} />}
              onPress={() =>
                router.push({ pathname: "/(tabs)/io/configure", params: { nanoId: nano.id } })
              }
            />
          ) : undefined
        }
      />
      <Screen>
        {nano ? (
          <NanoDetail nano={nano} />
        ) : (
          <EmptyState title="Device not found." />
        )}
      </Screen>
    </View>
  );
}
