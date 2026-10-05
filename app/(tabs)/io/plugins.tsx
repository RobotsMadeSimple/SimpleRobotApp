import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect } from "expo-router";
import { Download, Play, Plug, RefreshCw, RotateCw, Square } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button, buttonTextColor, Card, colors, EmptyState, IconTile, InfoTip, PageHeader,
  radii, Screen, SectionHeader, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import {
  errText, isActive, runtimeLabel, showError, stateLabel, stateTone,
} from "@/src/components/ui/plugins/pluginUi";
import { useActionPending } from "@/src/hooks/useActionPending";
import type { PluginSummary } from "@/src/models/robotModels";
import { useConnected } from "@/src/providers/RobotProvider";
import { PluginInstallError, robotClient } from "@/src/services/RobotConnectService";

const POLL_MS = 2000;

// ── Row ──────────────────────────────────────────────────────────────────────

function PluginCard({ plugin, onChanged }: { plugin: PluginSummary; onChanged: (p: PluginSummary) => void }) {
  // Spinner until the plugin's state moves (or the fallback timeout).
  const [pending, setPending] = useActionPending(undefined, `${plugin.state}|${plugin.enabled}`);

  const run = async (label: string, action: () => Promise<PluginSummary>) => {
    setPending(label);
    try {
      onChanged(await action());
    } catch (e) {
      setPending(null);
      showError(`${label} failed`, e);
    }
  };

  const busy = pending !== null;
  const active = isActive(plugin);
  const canStart = plugin.enabled && !active && plugin.state !== "error";
  const attention = plugin.message && (plugin.state === "crashed" || plugin.state === "error" || plugin.state === "degraded");

  return (
    <Card
      padded={false}
      onPress={() => router.push({ pathname: "/(tabs)/io/plugin-detail", params: { id: plugin.id } })}
      style={styles.card}
    >
      <View style={styles.head}>
        <IconTile color={colors.accentSoft}><Plug size={20} color={colors.accent} /></IconTile>
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={type.title} numberOfLines={1}>{plugin.name}</Text>
            {!!plugin.version && <Text style={type.caption}>v{plugin.version}</Text>}
          </View>
          <View style={styles.pills}>
            <StatusPill label={stateLabel(plugin.state)} tone={stateTone(plugin.state)} dot />
            <StatusPill label={runtimeLabel(plugin.runtime)} tone="neutral" />
          </View>
        </View>
        <Switch
          value={plugin.enabled}
          disabled={busy}
          onValueChange={v => run(v ? "Enable" : "Disable", () => robotClient.setPluginEnabled(plugin.id, v))}
          trackColor={{ false: colors.border, true: colors.success }}
        />
      </View>

      {!!plugin.description && <Text style={[type.body, styles.desc]} numberOfLines={2}>{plugin.description}</Text>}
      {!!attention && <Text style={[type.caption, styles.warn]} numberOfLines={2}>{plugin.message}</Text>}

      <View style={styles.actions}>
        {canStart && (
          <Button
            label="Start" size="sm" variant="secondary" disabled={busy} loading={pending === "Start"}
            icon={<Play size={14} color={buttonTextColor("secondary")} />}
            onPress={() => run("Start", () => robotClient.startPlugin(plugin.id))}
          />
        )}
        {active && (
          <Button
            label="Stop" size="sm" variant="secondary" disabled={busy} loading={pending === "Stop"}
            icon={<Square size={14} color={buttonTextColor("secondary")} />}
            onPress={() => run("Stop", () => robotClient.stopPlugin(plugin.id))}
          />
        )}
        {plugin.enabled && plugin.state !== "error" && plugin.state !== "disabled" && (
          <Button
            label="Restart" size="sm" variant="secondary" disabled={busy} loading={pending === "Restart"}
            icon={<RotateCw size={14} color={buttonTextColor("secondary")} />}
            onPress={() => run("Restart", () => robotClient.restartPlugin(plugin.id))}
          />
        )}
        <Text style={[type.caption, styles.counts]}>
          {plugin.stepCount} steps · {plugin.functionCount} functions · {plugin.propertyCount} properties
        </Text>
      </View>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PluginsPage() {
  const connected = useConnected();
  const [plugins, setPlugins]       = useState<PluginSummary[] | null>(null);
  const [installing, setInstalling] = useState(false);
  const [reloading, setReloading]   = useState(false);

  const refresh = useCallback(() => {
    if (!connected) return;
    robotClient.getPlugins().then(setPlugins).catch(() => {});
  }, [connected]);

  // Poll while the page has focus; refresh on (re)connect (refresh changes with `connected`).
  useFocusEffect(useCallback(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]));
  useEffect(() => { refresh(); }, [refresh]);

  const patch = (p: PluginSummary) => setPlugins(list => list?.map(x => x.id === p.id ? p : x) ?? list);

  const upload = async (uri: string, replace: boolean) => {
    try {
      const res = await robotClient.installPluginZip(uri, { replace });
      refresh();
      appAlert("Plugin installed", `${res.plugin?.name ?? res.id} was installed.`);
    } catch (e) {
      if (e instanceof PluginInstallError && e.code === "idExists" && !replace) {
        appAlert("Plugin already installed", `${e.message}\n\nReplace it with this version? Its settings are kept.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Replace", style: "destructive", onPress: () => { void upload(uri, true); } },
        ]);
      } else {
        const code = e instanceof PluginInstallError ? e.code : "";
        const title = code === "badZip" ? "Not a valid plugin zip"
                    : code === "badManifest" ? "Invalid plugin.json"
                    : "Install failed";
        appAlert(title, errText(e));
      }
    }
  };

  const install = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await upload(picked.assets[0].uri, false);
    } catch (e) {
      showError("Install failed", e);
    } finally {
      setInstalling(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    try {
      setPlugins(await robotClient.reloadPlugins());
    } catch (e) {
      showError("Reload failed", e);
    } finally {
      setReloading(false);
    }
  };

  const running = plugins?.filter(p => p.state === "running" || p.state === "degraded").length ?? 0;

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title="Plugins"
        subtitle="External extensions that add program steps, functions, and services"
        crumbs={[{ label: "I/O", href: "/io" }, { label: "Plugins" }]}
        right={
          <>
            <Button
              label="Reload" size="sm" variant="secondary" loading={reloading}
              icon={<RefreshCw size={14} color={buttonTextColor("secondary")} />} onPress={reload}
            />
            <Button
              label="Install" size="sm" loading={installing}
              icon={<Download size={14} color={buttonTextColor("primary")} />} onPress={install}
            />
          </>
        }
      />

      <Screen>
        <SectionHeader
          title={plugins ? `Installed (${running} running / ${plugins.length})` : "Installed"}
          right={<InfoTip text="A plugin is a separate process the controller starts and supervises. Install a plugin .zip, or drop a folder into the controller's plugins directory and tap Reload." />}
        />

        {plugins && plugins.length === 0 && (
          <Card>
            <EmptyState
              icon={<Plug size={32} color={colors.textFaint} />}
              title="No plugins installed"
              subtitle={"Install a plugin .zip, or copy its folder to the controller so that\n<data dir>/plugins/<id>/plugin.json exists, then tap Reload."}
              action={
                <Button label="Install plugin" icon={<Download size={15} color={buttonTextColor("primary")} />}
                        loading={installing} onPress={install} />
              }
            />
          </Card>
        )}

        {plugins && plugins.length > 0 && (
          <View style={styles.grid}>
            {plugins.map(p => <PluginCard key={p.id} plugin={p} onChanged={patch} />)}
          </View>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Cards share a row on wide windows (min basis keeps phones to one column).
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { flexGrow: 1, flexBasis: 360, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headText: { flex: 1, gap: spacing.xs + 2 },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  pills: { flexDirection: "row", gap: spacing.xs + 2, flexWrap: "wrap" },
  desc: { lineHeight: 19 },
  warn: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: spacing.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  counts: { marginLeft: "auto" },
});
