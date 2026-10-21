import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { Nfc, QrCode } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  Button, Card, colors, Input, PageHeader, radii, Screen, SectionHeader, spacing, type,
} from "@/src/components/ui/kit";
import { cancelNfc, nfcIsSupported, readStationUri } from "@/src/services/stationNfc";
import { hasAction, linkToParams, parseStationUri } from "@/src/services/stationLink";

export default function ScanStation() {
  const [perm, requestPerm] = useCameraPermissions();
  const [nfcOk, setNfcOk]   = useState(false);
  const [reading, setReading] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError]   = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    nfcIsSupported().then(setNfcOk).catch(() => setNfcOk(false));
    return () => cancelNfc();
  }, []);

  // Route any resolved payload through the shared station landing so behaviour is identical to a
  // cold tap/scan from outside the app (connect → navigate → optional run, with confirm if asked).
  const resolve = useCallback((raw: string | null | undefined, badMsg: string) => {
    const link = parseStationUri(raw);
    if (!link || !hasAction(link)) {
      handled.current = false;
      setError(badMsg);
      return;
    }
    handled.current = true;
    router.replace({ pathname: "/station", params: linkToParams(link) } as never);
  }, []);

  const onBarcode = useCallback((data: string) => {
    if (handled.current) return;
    handled.current = true;
    resolve(data, "That QR code isn't a Simple Robot station tag.");
  }, [resolve]);

  async function scanNfc() {
    if (reading) return;
    setError(null);
    setReading(true);
    try {
      const uri = await readStationUri();
      if (uri) resolve(uri, "That tag isn't a Simple Robot station tag.");
      else setError("Couldn't read a station link from that tag.");
    } catch {
      setError("NFC read was cancelled or failed.");
    } finally {
      setReading(false);
    }
  }

  const cameraReady = !!perm?.granted;

  return (
    <View style={styles.container}>
      <PageHeader
        title="Scan station"
        subtitle="Point at a station QR code or tap an NFC tag to connect and go"
        backTo="/robot"
      />
      <Screen>
        <SectionHeader title="QR code" />
        <Card style={styles.stack}>
          <View style={styles.preview}>
            {cameraReady ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => onBarcode(data)}
              />
            ) : (
              <View style={styles.permFill}>
                <QrCode size={32} color={colors.textFaint} />
                <Text style={styles.permText}>
                  {perm ? "Camera access is needed to scan QR codes." : "Preparing camera…"}
                </Text>
                {perm && !perm.granted && (
                  <Button label="Allow camera" size="sm" onPress={() => requestPerm()} />
                )}
              </View>
            )}
          </View>
          {cameraReady && <Text style={type.caption}>Hold a station QR code in the frame.</Text>}
        </Card>

        {nfcOk && (
          <>
            <SectionHeader title="NFC tag" />
            <Card style={styles.stack}>
              <View style={styles.nfcRow}>
                <Nfc size={22} color={colors.accent} />
                <Text style={styles.nfcText}>
                  {reading ? "Hold your phone to the station tag…" : "Tap to read a station tag."}
                </Text>
                {reading
                  ? <ActivityIndicator color={colors.accent} />
                  : <Button label="Scan tag" size="sm" onPress={scanNfc} />}
              </View>
            </Card>
          </>
        )}

        <SectionHeader title="Or paste a link" />
        <Card style={styles.stack}>
          <Input
            value={manual}
            onChangeText={t => { setManual(t); setError(null); }}
            placeholder="simplerobotapp://station?host=…"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Go"
            size="sm"
            disabled={!manual.trim()}
            onPress={() => resolve(manual.trim(), "That link isn't a Simple Robot station link.")}
          />
        </Card>

        {error && <Text style={styles.error}>{error}</Text>}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
  preview: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 360,
    alignSelf: "center",
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  permFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  permText: { ...type.body, color: colors.textFaint, textAlign: "center" },
  nfcRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  nfcText: { ...type.body, color: colors.text, flex: 1 },
  error: { ...type.body, color: colors.danger, marginTop: spacing.sm },
});
