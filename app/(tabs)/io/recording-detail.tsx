import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Download, Save, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SampleGraph } from "@/src/components/ui/io/IoHistoryGraph";
import {
  Button, buttonTextColor, Card, colors, Divider, PageHeader, Screen, SectionHeader, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import type { IoHistoryWindow, IoRecordingMeta, LoadCellUnit } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { exportSamplesCsv } from "@/src/services/ioExport";

/** One recording: a decimated overview graph (lazy — raw samples load only on export) plus
 * export / save-to-device / delete. */
export default function RecordingDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [win, setWin] = useState<IoHistoryWindow | null>(null);
  const [meta, setMeta] = useState<IoRecordingMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [expBusy, setExpBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    robotClient.getIoRecordingWindow(id, undefined, undefined, 3000)
      .then(({ window, recording }) => { setWin(window); setMeta(recording); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unit = (meta?.unit ?? win?.unit ?? "g") as LoadCellUnit;
  const dur = meta?.endUnixMs ? Math.max(1, Math.round((meta.endUnixMs - meta.startUnixMs) / 1000)) : null;

  const exportCsv = async () => {
    if (!id || !meta) return;
    setExpBusy(true);
    try {
      const { window } = await robotClient.getIoRecordingWindow(id, undefined, undefined, 1_000_000);
      await exportSamplesCsv(meta.name, window.samples, unit);
    } catch (e) { appAlert("Export failed", String(e)); }
    finally { setExpBusy(false); }
  };
  const save = async () => {
    if (!id) return;
    setSaveBusy(true);
    try { setMeta(await robotClient.saveIoRecording(id)); }
    catch (e) { appAlert("Save failed", String(e)); }
    finally { setSaveBusy(false); }
  };
  const del = async () => {
    if (!id) return;
    setDelBusy(true);
    try { await robotClient.deleteIoRecording(id); router.back(); }
    catch (e) { appAlert("Delete failed", String(e)); setDelBusy(false); }
  };

  const crumbs = [{ label: "I/O", href: "/io" }, { label: "Recordings", href: "/io/recordings" }, { label: meta?.name ?? "Recording" }];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title={meta?.name ?? "Recording"}
        subtitle={meta?.label || meta?.channelKey || ""}
        crumbs={crumbs}
        right={meta ? <StatusPill label={meta.saved ? "Saved" : "In memory"} tone={meta.saved ? "success" : "neutral"} dot={meta.saved} /> : undefined}
      />
      <Screen>
        <Card style={styles.stack}>
          <SampleGraph samples={win?.samples ?? []} unit={unit} height={220} />
          {meta && (
            <Text style={type.caption}>
              {meta.sampleCount} samples
              {dur != null ? ` · ${dur}s` : ""}
              {` · ${new Date(meta.startUnixMs).toLocaleString()}`}
              {loading ? " · loading…" : ""}
            </Text>
          )}
        </Card>

        <SectionHeader title="Export & manage" />
        <Card style={styles.stack}>
          <Button
            label="Export CSV"
            icon={<Download size={16} color={colors.onAccent} />}
            loading={expBusy}
            onPress={exportCsv}
          />
          <Button
            label={meta?.saved ? "Saved to device" : "Save to device"}
            variant="secondary"
            icon={<Save size={16} color={buttonTextColor("secondary")} />}
            loading={saveBusy}
            disabled={meta?.saved}
            onPress={save}
          />
          <Divider />
          <Button
            label="Delete recording"
            variant="dangerSoft"
            icon={<Trash2 size={16} color={buttonTextColor("dangerSoft")} />}
            loading={delBusy}
            onPress={del}
          />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
});
