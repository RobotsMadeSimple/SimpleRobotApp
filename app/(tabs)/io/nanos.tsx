import { wide } from "@/src/components/ui/responsive";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { IORow } from "@/src/components/ui/io/ioShared";
import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoState } from "@/src/models/robotModels";
import { Settings2 } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

function NanoDetail({ nano }: { nano: NanoState }) {
  const inputs    = nano.pins.filter(p => p.type === "Input");
  const outputs   = nano.pins.filter(p => p.type === "Output");
  const neopixels = nano.pins.filter(p => p.type === "Neopixel");

  const groups = [
    { label: "INPUTS",   pins: inputs    },
    { label: "OUTPUTS",  pins: outputs   },
    { label: "NEOPIXEL", pins: neopixels },
  ].filter(g => g.pins.length > 0);

  if (nano.pins.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No pins configured.</Text>
        <Text style={styles.emptySubtext}>Tap the settings icon to configure this board.</Text>
      </View>
    );
  }

  return (
    <>
      {groups.map(g => (
        <View key={g.label}>
          <Text style={styles.sectionLabel}>{g.label}</Text>
          <View style={styles.sectionBody}>
            {g.pins.map((pin, i) => (
              <IORow
                key={pin.pin}
                label={pin.name || `Pin ${pin.pin}`}
                sublabel={`${nano.name} · D${pin.pin}`}
                type={pin.type}
                value={pin.value}
                last={i === g.pins.length - 1}
                onToggle={
                  pin.type === "Output"
                    ? () => robotClient.setNanoOutput(nano.id, pin.pin, !pin.value)
                    : undefined
                }
              />
            ))}
          </View>
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
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title={nano ? nano.name : "Arduino Nano"}
        subtitle={
          nano
            ? `${nano.id} · ${nano.connected ? "Connected" : "Offline"}`
            : "Device not found"
        }
        right={
          nano ? (
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/(tabs)/io/configure", params: { nanoId: nano.id } })
              }
              hitSlop={8}
              style={styles.configBtn}
            >
              <Settings2 size={18} color="#6b7280" />
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={[{ paddingTop: 24, paddingBottom: 40, gap: 24 }, wide.content]}
        showsVerticalScrollIndicator={false}
      >
        {nano ? (
          <NanoDetail nano={nano} />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Device not found.</Text>
          </View>
        )}
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
  configBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState:   { marginTop: 40, alignItems: "center", gap: 6, paddingHorizontal: 32 },
  emptyText:    { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  emptySubtext: { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },
});
