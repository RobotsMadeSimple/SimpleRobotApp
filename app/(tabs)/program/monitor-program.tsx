import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function IO() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{title:"Monitor Program"}}/>
      <Text style={styles.text}>Monitor Program Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 24 },
});
