import { RobotCard } from "@/src/components/ui/RobotCards";
import { useRobots } from "@/src/providers/RobotProvider";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function Robot() {
  const { robots } = useRobots();
  const [manualIp, setManualIp] = useState("");

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.card}>
          <View style={styles.manualRow}>
            <Text style={styles.label}>Manual IP:</Text>

            <TextInput
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="192.168.x.x:1234"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />

            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Connect</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={robots}
        keyExtractor={(r) => r.serialNumber}
        renderItem={({ item }) => <RobotCard robot={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  banner: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  button: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
