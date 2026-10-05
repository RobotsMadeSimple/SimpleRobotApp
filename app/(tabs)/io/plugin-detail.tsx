import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Play, Plug, RefreshCw, RotateCw, Square, Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button, buttonTextColor, Card, colors, Divider, EmptyState, FormRow, Input, PageHeader, radii,
  RadioRow, Screen, SectionHeader, SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import {
  copyText, formatUptime, isActive, runtimeLabel, showError, stateLabel, stateTone,
} from "@/src/components/ui/plugins/pluginUi";
import { useActionPending } from "@/src/hooks/useActionPending";
import { useIsWide } from "@/src/components/ui/responsive";
import type { PluginConfigField, PluginConfigValues, PluginDetail } from "@/src/models/robotModels";
import { useConnected } from "@/src/providers/RobotProvider";
import { PluginConfigError, robotClient } from "@/src/services/RobotConnectService";

const DETAIL_POLL_MS = 1000;
const LOG_PAGE = 100;

// ── Config form helpers ──────────────────────────────────────────────────────

type DraftValue = string | boolean;
type Draft = Record<string, DraftValue>;

const toDraftValue = (f: PluginConfigField, v: unknown): DraftValue => {
  const x = v ?? f.default;
  if (f.type === "boolean") return x === true || x === "true" || x === 1;
  return x === undefined || x === null ? "" : String(x);
};

const baselineDraft = (schema: PluginConfigField[], config: PluginConfigValues | undefined): Draft => {
  const d: Draft = {};
  for (const f of schema) d[f.key] = toDraftValue(f, config?.[f.key]);
  return d;
};

/** Validate a number field's text against min/max; returns an error message or null. */
function numberProblem(f: PluginConfigField, text: string): string | null {
  if (text.trim() === "") return f.required ? "Required" : null;
  const n = Number(text);
  if (!Number.isFinite(n)) return "Enter a number";
  if (f.min !== undefined && n < f.min) return `Must be at least ${f.min}`;
  if (f.max !== undefined && n > f.max) return `Must be at most ${f.max}`;
  return null;
}

function ConfigFieldRow({
  field, value, onChange, error,
}: {
  field: PluginConfigField;
  value: DraftValue;
  onChange: (v: DraftValue) => void;
  error?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const label = field.label ?? field.key;
  const hint = field.help;
  const errStyle = error ? styles.inputError : undefined;
  const errorText = error ? <Text style={[type.caption, styles.errorText]}>{error}</Text> : null;

  switch (field.type) {
    case "boolean":
      return (
        <FormRow label={label} hint={hint} inline>
          <Switch
            value={value === true}
            onValueChange={onChange}
            trackColor={{ false: colors.border, true: colors.success }}
          />
        </FormRow>
      );
    case "enum": {
      const options = field.options ?? [];
      const current = String(value);
      return (
        <FormRow label={label} hint={hint}>
          {options.length <= 4 ? (
            <SegmentedControl size="sm" options={options} value={current} onChange={onChange} />
          ) : (
            <View style={[styles.pickerBox, error ? styles.inputError : null]}>
              <Button
                variant="secondary" size="sm" label={current || "Choose…"}
                icon={open ? <ChevronUp size={14} color={buttonTextColor("secondary")} />
                           : <ChevronDown size={14} color={buttonTextColor("secondary")} />}
                onPress={() => setOpen(o => !o)}
              />
              {open && options.map((o, i) => (
                <View key={o}>
                  {i > 0 && <Divider />}
                  <RadioRow title={o} selected={o === current} onPress={() => { onChange(o); setOpen(false); }} />
                </View>
              ))}
            </View>
          )}
          {errorText}
        </FormRow>
      );
    }
    case "number": {
      const bounds = [field.min !== undefined ? `min ${field.min}` : null, field.max !== undefined ? `max ${field.max}` : null,
                      field.step !== undefined ? `step ${field.step}` : null].filter(Boolean).join(" · ");
      return (
        <FormRow label={label} hint={[hint, bounds].filter(Boolean).join(" - ") || undefined}>
          <Input
            value={String(value)}
            onChangeText={onChange}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            style={errStyle ? [type.mono, errStyle] : type.mono}
          />
          {errorText}
        </FormRow>
      );
    }
    case "password":
      return (
        <FormRow label={label} hint={hint}>
          <View style={styles.passwordRow}>
            <Input
              style={errStyle ? [styles.grow, errStyle] : styles.grow}
              value={String(value)}
              onChangeText={onChange}
              secureTextEntry={!revealed}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="password"
            />
            <Button
              variant="ghost" size="sm" label={revealed ? "Hide" : "Show"}
              icon={revealed ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
              onPress={() => setRevealed(r => !r)}
            />
          </View>
          {errorText}
        </FormRow>
      );
    default:
      return (
        <FormRow label={label} hint={hint}>
          <Input
            value={String(value)}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            style={errStyle}
          />
          {errorText}
        </FormRow>
      );
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PluginDetailPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const pluginId = Array.isArray(id) ? id[0] : id;
  const connected = useConnected();
  const wide = useIsWide();

  const [plugin, setPlugin]   = useState<PluginDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useActionPending(undefined, plugin ? `${plugin.state}|${plugin.enabled}` : null);

  // ── Detail polling ─────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    if (!connected || !pluginId) return;
    robotClient.getPlugin(pluginId)
      .then(p => { setPlugin(p); setMissing(false); })
      .catch(e => { if (/unknown|notFound|not found/i.test(e instanceof Error ? e.message : String(e))) setMissing(true); });
  }, [connected, pluginId]);

  useFocusEffect(useCallback(() => {
    refresh();
    const t = setInterval(refresh, DETAIL_POLL_MS);
    return () => clearInterval(t);
  }, [refresh]));
  useEffect(() => { refresh(); }, [refresh]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setPending(label);
    try { await fn(); refresh(); } catch (e) { setPending(null); showError(`${label} failed`, e); }
  };

  // ── Config draft ───────────────────────────────────────────────────────────
  const schema = useMemo(() => plugin?.manifest?.configSchema ?? [], [plugin?.manifest?.configSchema]);
  const baseline = useMemo(() => baselineDraft(schema, plugin?.config), [schema, plugin?.config]);
  const baselineKey = JSON.stringify(baseline);
  const [draft, setDraft] = useState<Draft>({});
  const lastBaseline = useRef<string>("");
  const [serverField, setServerField] = useState<{ field?: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Adopt the controller's config when it changes, unless the user has unsaved edits.
  useEffect(() => {
    if (!plugin) return;
    setDraft(prev => (lastBaseline.current === "" || JSON.stringify(prev) === lastBaseline.current) ? baseline : prev);
    lastBaseline.current = baselineKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineKey, !!plugin]);

  const dirty = JSON.stringify(draft) !== baselineKey;
  const localErrors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const f of schema) {
      const v = draft[f.key];
      if (f.type === "number" && typeof v === "string") { const p = numberProblem(f, v); if (p) e[f.key] = p; }
      else if (f.required && f.type !== "boolean" && String(v ?? "").trim() === "") e[f.key] = "Required";
    }
    return e;
  }, [schema, draft]);

  const setField = (key: string, v: DraftValue) => {
    setDraft(d => ({ ...d, [key]: v }));
    setServerField(s => (s?.field === key ? null : s));
  };

  const save = async () => {
    if (!plugin || saving) return;
    if (Object.keys(localErrors).length) return;
    const config: PluginConfigValues = { ...(plugin.config ?? {}) };
    for (const f of schema) {
      const v = draft[f.key];
      if (f.type === "boolean") config[f.key] = v === true;
      else if (f.type === "number") { if (String(v).trim() === "") delete config[f.key]; else config[f.key] = Number(v); }
      else config[f.key] = String(v ?? "");
    }
    setSaving(true);
    setServerField(null);
    try {
      await robotClient.setPluginConfig(plugin.id, config);
      lastBaseline.current = "";   // let the next refresh replace the draft with the saved config
      refresh();
    } catch (e) {
      if (e instanceof PluginConfigError) {
        setServerField({ field: e.field, message: e.message });
        if (!e.field) showError("Settings not saved", e);
      } else {
        showError("Settings not saved", e);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Logs ───────────────────────────────────────────────────────────────────
  const [logs, setLogs]         = useState<string[]>([]);
  const [visible, setVisible]   = useState(LOG_PAGE);
  const [autoLogs, setAutoLogs] = useState(true);
  const fetchedUntil = useRef(0);
  const logScroll = useRef<ScrollView>(null);

  const fetchLogs = useCallback(async () => {
    if (!connected || !pluginId) return;
    try {
      const page = await robotClient.getPluginLogs(pluginId, fetchedUntil.current);
      if (page.totalCount < fetchedUntil.current) {        // cleared elsewhere or log rolled over
        fetchedUntil.current = 0;
        setLogs([]);
        return;
      }
      if (page.logs.length > 0) {
        fetchedUntil.current = page.totalCount;
        setLogs(prev => {
          const next = [...prev, ...page.logs];
          return next.length > 5000 ? next.slice(next.length - 5000) : next;
        });
      }
    } catch { /* keep what we have */ }
  }, [connected, pluginId]);

  useFocusEffect(useCallback(() => {
    fetchedUntil.current = 0;
    setLogs([]);
    setVisible(LOG_PAGE);
    fetchLogs();
    if (!autoLogs) return;
    const t = setInterval(fetchLogs, 1000);
    return () => clearInterval(t);
  }, [fetchLogs, autoLogs]));

  const clearLogs = async () => {
    if (!pluginId) return;
    try {
      await robotClient.clearPluginLogs(pluginId);
      fetchedUntil.current = 0;
      setLogs([]);
    } catch (e) { showError("Clear failed", e); }
  };

  const shown = logs.slice(Math.max(0, logs.length - visible));

  // ── External connection info ───────────────────────────────────────────────
  const [tokenShown, setTokenShown] = useState(false);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);
  const copy = async (what: "url" | "token", text: string) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? null : c)), 1500);
    } else {
      appAlert(what === "url" ? "Plugin URL" : "Plugin token", text);   // no clipboard here: show it to read out
    }
  };
  const rotate = () => {
    if (!plugin) return;
    appAlert("Rotate token", "The current token stops working. External plugins must reconnect with the new one.", [
      { text: "Cancel", style: "cancel" },
      { text: "Rotate", style: "destructive", onPress: () => { void act("Rotate", () => robotClient.rotatePluginToken(plugin.id)); } },
    ]);
  };

  const uninstall = () => {
    if (!plugin) return;
    appAlert("Uninstall plugin", `Stop and delete "${plugin.name}" and its saved settings? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Uninstall", style: "destructive",
        onPress: async () => {
          try {
            await robotClient.uninstallPlugin(plugin.id);
            if (router.canGoBack()) router.back(); else router.replace("/(tabs)/io/plugins");
          } catch (e) { showError("Uninstall failed", e); }
        },
      },
    ]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const crumbs = [
    { label: "I/O", href: "/io" },
    { label: "Plugins", href: "/(tabs)/io/plugins" },
    { label: plugin?.name ?? pluginId ?? "Plugin" },
  ];

  if (!plugin) {
    return (
      <View style={styles.container}>
        <NotConnectedOverlay />
        <PageHeader title="Plugin" subtitle={missing ? "Not found" : "Loading…"} crumbs={crumbs} />
        <Screen>
          {missing && (
            <Card>
              <EmptyState
                icon={<Plug size={32} color={colors.textFaint} />}
                title="Plugin not found"
                subtitle="It may have been uninstalled."
                action={<Button label="Back to plugins" variant="secondary" onPress={() => router.replace("/(tabs)/io/plugins")} />}
              />
            </Card>
          )}
        </Screen>
      </View>
    );
  }

  const m = plugin.manifest ?? ({} as PluginDetail["manifest"]);
  const active = isActive(plugin);
  const busy = pending !== null;
  const wsUrl = robotClient.pluginWsUrl();
  const pluginUrl = wsUrl ?? "ws://<controller>:<port>/plugin";
  const steps = m.steps ?? [];
  const functions = m.functions ?? [];
  const properties = m.properties ?? [];
  const live = plugin.properties ?? {};
  const undocumented = Object.keys(live).filter(k => !properties.some(p => p.name === k));

  const statusCard = (
    <>
      <SectionHeader title="Status" />
      <Card style={styles.stack}>
        <View style={styles.pillRow}>
          <StatusPill label={stateLabel(plugin.state)} tone={stateTone(plugin.state)} dot />
          <StatusPill label={runtimeLabel(plugin.runtime)} tone="neutral" />
          {!!plugin.statusState && plugin.statusState !== "ok" && (
            <StatusPill label={`Plugin reports ${plugin.statusState}`} tone={plugin.statusState === "error" ? "danger" : "warning"} />
          )}
        </View>
        {!!plugin.description && <Text style={type.body}>{plugin.description}</Text>}
        {!!plugin.message && <Text style={[type.body, styles.message]}>{plugin.message}</Text>}
        {!!plugin.statusMessage && <Text style={type.body}>{plugin.statusMessage}</Text>}
        <Divider />
        <Fact label="PID" value={plugin.pid ? String(plugin.pid) : "-"} />
        <Fact label="Uptime" value={active && plugin.startedUnixMs ? formatUptime(plugin.startedUnixMs) : "-"} />
        <Fact label="Restarts" value={String(plugin.restartCount ?? 0)} />
        <Fact label="Last exit code" value={plugin.lastExitCode === null || plugin.lastExitCode === undefined ? "-" : String(plugin.lastExitCode)} />
        <Fact label="Connected" value={plugin.connected ? "Yes" : "No"} />
        <Divider />
        <View style={styles.actionRow}>
          <View style={styles.switchRow}>
            <Switch
              value={plugin.enabled} disabled={busy}
              onValueChange={v => act(v ? "Enable" : "Disable", () => robotClient.setPluginEnabled(plugin.id, v))}
              trackColor={{ false: colors.border, true: colors.success }}
            />
            <Text style={type.body}>{plugin.enabled ? "Enabled" : "Disabled"}</Text>
          </View>
          {plugin.enabled && !active && plugin.state !== "error" && (
            <Button label="Start" size="sm" variant="secondary" disabled={busy} loading={pending === "Start"}
              icon={<Play size={14} color={buttonTextColor("secondary")} />}
              onPress={() => act("Start", () => robotClient.startPlugin(plugin.id))} />
          )}
          {active && (
            <Button label="Stop" size="sm" variant="secondary" disabled={busy} loading={pending === "Stop"}
              icon={<Square size={14} color={buttonTextColor("secondary")} />}
              onPress={() => act("Stop", () => robotClient.stopPlugin(plugin.id))} />
          )}
          {plugin.enabled && plugin.state !== "error" && (
            <Button label="Restart" size="sm" variant="secondary" disabled={busy} loading={pending === "Restart"}
              icon={<RotateCw size={14} color={buttonTextColor("secondary")} />}
              onPress={() => act("Restart", () => robotClient.restartPlugin(plugin.id))} />
          )}
        </View>
      </Card>
    </>
  );

  const externalCard = plugin.runtime === "external" && (
    <>
      <SectionHeader title="Connect an external plugin" />
      <Card style={styles.stack}>
        <Text style={type.body}>Nothing is launched for this plugin. Start it yourself and connect to this address with the token below.</Text>
        <FormRow label="URL">
          <View style={styles.passwordRow}>
            <Text style={[type.mono, styles.grow]} selectable numberOfLines={2}>{pluginUrl}</Text>
            <Button variant="ghost" size="sm" label={copied === "url" ? "Copied" : "Copy"} disabled={!wsUrl}
              icon={copied === "url" ? <Check size={14} color={colors.success} /> : <Copy size={14} color={colors.textMuted} />}
              onPress={() => copy("url", pluginUrl)} />
          </View>
        </FormRow>
        <FormRow label="Token">
          <View style={styles.passwordRow}>
            <Text style={[type.mono, styles.grow]} selectable numberOfLines={2}>
              {plugin.token ? (tokenShown ? plugin.token : "•".repeat(24)) : "-"}
            </Text>
            <Button variant="ghost" size="sm" label={tokenShown ? "Hide" : "Show"} disabled={!plugin.token}
              icon={tokenShown ? <EyeOff size={14} color={colors.textMuted} /> : <Eye size={14} color={colors.textMuted} />}
              onPress={() => setTokenShown(s => !s)} />
            <Button variant="ghost" size="sm" label={copied === "token" ? "Copied" : "Copy"} disabled={!plugin.token}
              icon={copied === "token" ? <Check size={14} color={colors.success} /> : <Copy size={14} color={colors.textMuted} />}
              onPress={() => plugin.token && copy("token", plugin.token)} />
          </View>
        </FormRow>
        <Button label="Rotate token" size="sm" variant="secondary" disabled={busy} style={styles.selfStart}
          icon={<RefreshCw size={14} color={buttonTextColor("secondary")} />} onPress={rotate} />
      </Card>
    </>
  );

  const contributionsCard = (
    <>
      <SectionHeader title="Contributions" />
      <Card style={styles.stack}>
        <Text style={type.sectionLabel}>Steps ({steps.length})</Text>
        {steps.length === 0 && <Text style={type.subtitle}>None</Text>}
        {steps.map(s => (
          <View key={s.id} style={styles.item}>
            <Text style={type.title}>{s.label}</Text>
            <Text style={type.caption}>{(s.params?.length ?? 0)} params · {(s.outputs?.length ?? 0)} outputs</Text>
            {!!s.description && <Text style={type.body}>{s.description}</Text>}
          </View>
        ))}
        <Divider />
        <Text style={type.sectionLabel}>Functions ({functions.length})</Text>
        {functions.length === 0 && <Text style={type.subtitle}>None</Text>}
        {functions.map(f => (
          <View key={f.name} style={styles.item}>
            <Text style={type.mono}>{f.signature ?? `${plugin.id}.${f.name}()`}</Text>
            {!!f.description && <Text style={type.body}>{f.description}</Text>}
          </View>
        ))}
        <Divider />
        <Text style={type.sectionLabel}>Properties ({properties.length})</Text>
        {properties.length === 0 && undocumented.length === 0 && <Text style={type.subtitle}>None</Text>}
        {properties.map(p => (
          <View key={p.name} style={styles.propRow}>
            <View style={styles.grow}>
              <Text style={type.mono}>${plugin.id}.{p.name}</Text>
              {!!p.description && <Text style={type.caption}>{p.description}</Text>}
            </View>
            <Text style={[type.mono, styles.propValue]}>{p.name in live ? String(live[p.name]) : "-"}</Text>
          </View>
        ))}
        {undocumented.map(k => (
          <View key={k} style={styles.propRow}>
            <View style={styles.grow}>
              <Text style={type.mono}>${plugin.id}.{k}</Text>
              <Text style={type.caption}>Undocumented</Text>
            </View>
            <Text style={[type.mono, styles.propValue]}>{String(live[k])}</Text>
          </View>
        ))}
      </Card>
    </>
  );

  const configCard = schema.length > 0 && (
    <>
      <SectionHeader title="Configuration" />
      <Card style={styles.stack}>
        {schema.map(f => (
          <ConfigFieldRow
            key={f.key}
            field={f}
            value={draft[f.key] ?? ""}
            onChange={v => setField(f.key, v)}
            error={localErrors[f.key] ?? (serverField?.field === f.key ? serverField.message : null)}
          />
        ))}
        {!!serverField && !serverField.field && <Text style={[type.caption, styles.errorText]}>{serverField.message}</Text>}
        <View style={styles.actionRow}>
          <Button label="Save" loading={saving} disabled={!dirty || Object.keys(localErrors).length > 0}
            icon={<Check size={15} color={buttonTextColor("primary")} />} onPress={save} />
          {dirty && <Button label="Revert" variant="ghost" onPress={() => { setDraft(baseline); setServerField(null); }} />}
        </View>
      </Card>
    </>
  );

  const logsCard = (
    <>
      <SectionHeader title="Logs" />
      <Card style={styles.stack}>
        <View style={styles.actionRow}>
          <View style={styles.switchRow}>
            <Switch value={autoLogs} onValueChange={setAutoLogs} trackColor={{ false: colors.border, true: colors.accent }} />
            <Text style={type.body}>Auto-refresh</Text>
          </View>
          <Button label="Refresh" size="sm" variant="secondary" onPress={fetchLogs} />
          <Button label="Clear" size="sm" variant="dangerSoft" onPress={clearLogs} />
        </View>
        {logs.length > visible && (
          <Button label={`Load earlier (${logs.length - visible} more)`} size="sm" variant="secondary"
                  onPress={() => setVisible(v => v + LOG_PAGE)} />
        )}
        <ScrollView
          ref={logScroll} style={styles.logBox} nestedScrollEnabled
          onContentSizeChange={() => { if (autoLogs && visible === LOG_PAGE) logScroll.current?.scrollToEnd({ animated: false }); }}
        >
          {shown.length === 0
            ? <Text style={type.subtitle}>No log output yet.</Text>
            : shown.map((l, i) => <Text key={i} style={styles.logLine} selectable>{l}</Text>)}
        </ScrollView>
      </Card>
    </>
  );

  const uninstallCard = (
    <Button label="Uninstall plugin" variant="dangerSoft" icon={<Trash2 size={15} color={buttonTextColor("dangerSoft")} />}
            onPress={uninstall} style={styles.selfStart} />
  );

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title={plugin.name}
        subtitle={[plugin.version && `v${plugin.version}`, plugin.author].filter(Boolean).join(" · ") || undefined}
        crumbs={crumbs}
        right={<StatusPill label={stateLabel(plugin.state)} tone={stateTone(plugin.state)} dot />}
      />
      <Screen>
        {wide ? (
          <View style={styles.cols}>
            <View style={styles.col}>{statusCard}{externalCard}{contributionsCard}</View>
            <View style={styles.col}>{configCard}{logsCard}{uninstallCard}</View>
          </View>
        ) : (
          <>
            {statusCard}{externalCard}{configCard}{contributionsCard}{logsCard}{uninstallCard}
          </>
        )}
      </Screen>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={type.body}>{label}</Text>
      <Text style={type.mono}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  cols: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  col: { flex: 1, gap: spacing.md, minWidth: 0 },
  stack: { gap: spacing.md },
  pillRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  message: { color: colors.danger },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  selfStart: { alignSelf: "flex-start" },
  grow: { flex: 1 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  item: { gap: 2 },
  propRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  propValue: { minWidth: 60, textAlign: "right", color: colors.text },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, marginTop: spacing.xs },
  pickerBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.xs },
  logBox: {
    maxHeight: 320, backgroundColor: colors.surfaceDark, borderRadius: radii.sm, padding: spacing.md,
  },
  logLine: { ...type.mono, fontSize: 11, color: colors.onSurfaceDark },
});
