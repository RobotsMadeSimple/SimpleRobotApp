import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { IORow } from "@/src/components/ui/io/ioShared";
import { useRelayIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Settings2 } from "lucide-react-native";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function RelayPage() {
  const relay     = useRelayIO();
  const connected = relay?.connected ?? false;
  const relays    = relay?.relays ?? [false, false, false, false];
  const names     = relay?.names  ?? ["Relay 1", "Relay 2", "Relay 3", "Relay 4"];
  const serial    = relay?.serial ?? "";

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title="USB Relay Board"
        subtitle={`DCTTECH 4CH · HID${serial ? ` · ${serial}` : ""} · ${connected ? "Connected" : "Offline"}`}
        right={
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/io/configure-relay")}
            hitSlop={8}
            style={styles.configBtn}
          >
            <Settings2 size={18} color="#6b7280" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.sectionLabel}>RELAYS</Text>
          <View style={styles.sectionBody}>
            {[0, 1, 2, 3].map((i) => (
              <IORow
                key={i}
                label={names[i] ?? `Relay ${i + 1}`}
                sublabel={`Channel ${i + 1}`}
                type="Output"
                value={relays[i] ?? false}
                last={i === 3}
                onToggle={() => robotClient.setRelay(i + 1, !(relays[i] ?? false))}
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
  configBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
});
