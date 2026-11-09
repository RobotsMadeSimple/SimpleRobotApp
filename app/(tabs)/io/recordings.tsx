import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Gauge, RefreshCw } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button, buttonTextColor, colors, Divider, EmptyState, ListRow, PageHeader, Screen,
  spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import type { IoRecordingMeta } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";

/** Browse past IO recordings (optionally filtered to one channel). Lazy sample loading
 * happens in the detail screen — this list holds only lightweight metadata. */
export default function RecordingsScreen() {
  const { channelKey } = useLocalSearchParams<{ channelKey?: string }>();
  const [recs, setRecs] = useState<IoRecordingMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    robotClient.listIoRecordings()
      .then(list => setRecs(channelKey ? list.filter(r => r.channelKey === channelKey) : list))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelKey]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const crumbs = [{ label: "I/O", href: "/io" }, { label: "Recordings" }];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title="Recordings"
        subtitle={channelKey ? "This load cell" : "All channels"}
        crumbs={crumbs}
        right={
          <Button
            variant="secondary"
            size="sm"
            label="Refresh"
            icon={<RefreshCw size={15} color={buttonTextColor("secondary")} />}
            loading={loading}
            onPress={refresh}
          />
        }
      />
      <Screen>
        {recs.length === 0 ? (
          <EmptyState
            title="No recordings yet."
            subtitle="Start one from a load cell's calibrate screen (Record), then it shows up here."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {recs.map((r, i) => {
              const started = new Date(r.startUnixMs);
              const dur = r.endUnixMs ? Math.max(1, Math.round((r.endUnixMs - r.startUnixMs) / 1000)) : null;
              const sub = [
                r.label || r.channelKey,
                started.toLocaleString(),
                dur != null ? `${dur}s` : (r.active ? "recording…" : ""),
                `${r.sampleCount} samples`,
              ].filter(Boolean).join(" · ");
              return (
                <View key={r.id}>
                  <ListRow
                    title={r.name}
                    subtitle={sub}
                    icon={<Gauge size={20} color={colors.accent} />}
                    iconColor={colors.accentSoft}
                    chevron
                    onPress={() => router.push({ pathname: "/(tabs)/io/recording-detail", params: { id: r.id } })}
                    right={
                      r.active
                        ? <StatusPill label="Live" tone="success" dot />
                        : r.saved
                          ? <StatusPill label="Saved" tone="neutral" />
                          : <Text style={type.caption}>in memory</Text>
                    }
                  />
                  {i < recs.length - 1 && <Divider inset />}
                </View>
              );
            })}
          </ScrollView>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.xs, paddingBottom: spacing.xxl },
});
