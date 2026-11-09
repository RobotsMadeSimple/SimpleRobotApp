import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, colors, Input, PageHeader, Screen, SectionHeader, spacing, type } from "@/src/components/ui/kit";
import { hasAction, linkToParams, parseStationUri } from "@/src/services/stationLink";

// On web / Electron there's no reliable camera-scan or NFC, so the scanner degrades to pasting a
// station link (handy for testing). Phones get the full QR + NFC scanner in scan-station.tsx.
export default function ScanStationWeb() {
  const [manual, setManual] = useState("");
  const [error, setError]   = useState<string | null>(null);

  function go() {
    const link = parseStationUri(manual.trim());
    if (!link || !hasAction(link)) {
      setError("That link isn't a Simple Robot station link.");
      return;
    }
    router.replace({ pathname: "/station", params: linkToParams(link) } as never);
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Scan station" subtitle="Scanning QR codes and NFC tags is available on the phone app" backTo="/robot" />
      <Screen>
        <SectionHeader title="Open a station link" />
        <Card style={styles.stack}>
          <Input
            value={manual}
            onChangeText={t => { setManual(t); setError(null); }}
            placeholder="simplerobotapp://station?host=…"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label="Go" size="sm" disabled={!manual.trim()} onPress={go} />
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
  error: { ...type.body, color: colors.danger },
});
