import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { FileCode, Play, Plus, Trash2, Upload } from "lucide-react-native";
import {
  Button, buttonTextColor, Card, colors, EmptyState, ListRow, PageHeader, Screen, spacing,
} from "@/src/components/ui/kit";
import { appAlert } from "@/src/components/ui/AppAlert";
import { useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * Manage G-code files stored on the controller: upload a .nc/.gcode, validate, run it straight
 * through the executor (stop from the monitor), or delete it. Mirrors the DXF file flow used by
 * the CNC builder. Running a file needs a connection; it runs as a one-step synthetic program.
 */
export default function GcodeFilesScreen() {
  const connected = useConnected();
  const [files, setFiles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(() => {
    if (!connected) { setFiles([]); return; }
    robotClient.listGcodeFiles().then(setFiles).catch(() => setFiles([]));
  }, [connected]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const lower = asset.name.toLowerCase();
    const ok = [".nc", ".gcode", ".tap", ".ngc", ".txt"].some(e => lower.endsWith(e));
    const name = ok ? asset.name : asset.name + ".nc";
    setUploading(true);
    try {
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" });
      await robotClient.uploadGcodeFile(name, content);
      refresh();
    } catch (e: any) {
      appAlert("Upload Failed", e?.message ?? "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  async function handleRun(name: string) {
    setBusy(name);
    try {
      const check = await robotClient.validateGcodeFile(name);
      if (!check.ok) { appAlert("Can't Run", check.error ?? "The file has an error."); return; }
      appAlert(
        "Run G-code?",
        `${name}\n${check.lines ?? 0} lines · ${check.moves ?? 0} moves\n\nMake sure the path is clear. Stop from the monitor.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Run", style: "default", onPress: async () => {
              try { await robotClient.runGcodeFile(name); router.navigate("/(tabs)/program"); }
              catch (e: any) { appAlert("Run Failed", e?.message ?? "Unknown error"); }
            },
          },
        ],
      );
    } catch (e: any) {
      appAlert("Error", e?.message ?? "Validation failed");
    } finally {
      setBusy(null);
    }
  }

  function handleDelete(name: string) {
    appAlert("Delete G-code", `Delete "${name}" from the controller?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try { await robotClient.deleteGcodeFile(name); refresh(); }
          catch (e: any) { appAlert("Error", e?.message ?? "Delete failed"); }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="G-code Files" subtitle="Upload, run, and manage G-code on the robot" backTo="/program" />
      <Screen>
        <Button
          label={uploading ? "Uploading…" : "Upload G-code File"}
          variant="primary"
          icon={<Upload size={16} color={buttonTextColor("primary")} />}
          onPress={handleUpload}
          disabled={!connected || uploading}
          style={{ marginBottom: spacing.md }}
        />

        {files === null ? (
          <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : files.length === 0 ? (
          <EmptyState
            icon={<FileCode size={28} color={colors.textFaint} />}
            title={connected ? "No G-code files yet" : "Not connected"}
            subtitle={connected ? "Upload a .nc or .gcode file to run it on the robot." : "Connect to a robot to manage files."}
          />
        ) : (
          <Card padded={false}>
            {files.map((f) => (
              <ListRow
                key={f}
                card={false}
                icon={<FileCode size={20} color={colors.accent} />}
                iconColor={colors.accentSoft}
                title={f}
                right={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Button
                      label="Run"
                      size="sm"
                      variant="primary"
                      icon={busy === f ? undefined : <Play size={14} color={buttonTextColor("primary")} />}
                      disabled={!connected || busy != null}
                      onPress={() => handleRun(f)}
                    />
                    <Trash2 size={18} color={colors.danger} onPress={() => handleDelete(f)} />
                  </View>
                }
              />
            ))}
          </Card>
        )}

        <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: spacing.lg, lineHeight: 17 }}>
          You can also stream G-code live: point a GRBL-style sender at this robot's TCP port
          (default 8500), or use the WebSocket at /gcode/stream. Spindle output, rapid speed, feed
          and arc tolerance are on Robot › Configure.
        </Text>
      </Screen>
    </View>
  );
}
