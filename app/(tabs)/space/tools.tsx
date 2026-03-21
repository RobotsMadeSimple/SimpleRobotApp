import { Tabs } from "expo-router";
import { Wrench } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

export default function ToolsPage() {
  return (
    <View style={styles.container}>
      <Tabs.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <View style={styles.iconTile}>
          <Wrench size={32} color="#2563eb" />
        </View>
        <Text style={styles.title}>Tools</Text>
        <Text style={styles.sub}>Tool frame configuration coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  sub: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
});
