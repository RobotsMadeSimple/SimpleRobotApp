import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { router } from 'expo-router';
import { Button, StyleSheet, Text, View } from "react-native";

export default function Program() {
  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <Text style={styles.text}>Program Screen</Text>
      <Button title="outline" onPress={() => router.push(`/program/monitor-program`)}>
        </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 24 },
});
