import { useLocalSearchParams } from "expo-router";
import {
  AlertTriangle, Bell, BellOff, CheckCheck, CheckCircle2, ChevronDown, ChevronUp, Info,
  OctagonAlert, Trash2, Wrench, XCircle, type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import {
  Button, buttonTextColor, Card, colors, EmptyState, InfoTip, PageHeader, radii, Screen,
  SectionHeader, spacing, StatTile, StatusPill, type,
} from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePaneLayout } from "@/src/components/ui/responsive";
import type { AlarmCatalogEntry, AlarmEntry, AlarmSeverity } from "@/src/models/safetyModels";
import { useIoDevices, useRobotStatusValue } from "@/src/providers/RobotProvider";
import {
  acknowledgeAlarm, clearAlarms, errorText, getAlarmCatalog, getAlarms,
} from "@/src/services/safetyApi";

// The controller's alarm history: active alarms first, then the history, each expanding to the
// catalog's cause and remedy. `?code=` (from a program error) opens that code's help.

const PAGE = 50;

const SEVERITY: Record<AlarmSeverity, { icon: LucideIcon; fg: string; bg: string; label: string }> = {
  critical: { icon: OctagonAlert,  fg: colors.danger,  bg: colors.dangerSoft,  label: "Critical" },
  error:    { icon: XCircle,       fg: colors.danger,  bg: colors.dangerSoft,  label: "Error" },
  warning:  { icon: AlertTriangle, fg: colors.warning, bg: colors.warningSoft, label: "Warning" },
  info:     { icon: Info,          fg: colors.accent,  bg: colors.accentSoft,  label: "Info" },
};

function sev(s: string | undefined) {
  return SEVERITY[(s as AlarmSeverity) in SEVERITY ? (s as AlarmSeverity) : "error"];
}

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Alarms() {
  const params = useLocalSearchParams<{ code?: string }>();
  const connected       = useRobotStatusValue(s => s.connected);
  const lastAlarmUpdate = useRobotStatusValue(s => s.lastAlarmUpdate ?? 0);
  const plugins         = useRobotStatusValue(s => s.plugins);
  const ioDevices       = useIoDevices();
  const desktop = usePaneLayout() === "desktop";
  const narrow  = usePaneLayout() === "single";

  const [catalog, setCatalog] = useState<AlarmCatalogEntry[]>([]);
  const [alarms, setAlarms]   = useState<AlarmEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [limit, setLimit]     = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [open, setOpen]       = useState<string | null>(null);
  const [helpCode, setHelpCode] = useState<string | null>(typeof params.code === "string" ? params.code : null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadTick, setReloadTick] = useState(0);

  // A new ?code= (another program error's help link) opens that code's help.
  const [seenCode, setSeenCode] = useState(params.code);
  if (params.code !== seenCode) {
    setSeenCode(params.code);
    if (typeof params.code === "string") setHelpCode(params.code);
  }

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // Refetch whenever the controller reports an alarm change, the page grows, or an action ran.
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    getAlarms(0, limit)
      .then(page => {
        if (!alive) return;
        setAlarms(page.alarms);
        setTotal(page.total);
        setActiveCount(page.activeCount);
        setNow(Date.now());
      })
      .catch(() => { /* keep what is shown; the next status change retries */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [connected, limit, lastAlarmUpdate, reloadTick]);
  useEffect(() => {
    if (!connected) return;
    getAlarmCatalog().then(setCatalog).catch(() => {});
  }, [connected]);

  const byCode = useMemo(() => new Map(catalog.map(c => [c.code, c])), [catalog]);
  const deviceName = useCallback((id?: string | null) => {
    if (!id) return null;
    if (id === "stb") return "Motor driver";
    return ioDevices.find(d => d.id === id)?.name || id;
  }, [ioDevices]);
  const pluginName = useCallback((id?: string | null) =>
    !id ? null : plugins?.find(p => p.id === id)?.name || id, [plugins]);

  const active  = alarms.filter(a => a.active);
  const history = alarms.filter(a => !a.active);
  const critical = active.filter(a => a.severity === "critical" || a.severity === "error").length;
  const unacked  = alarms.filter(a => !a.acknowledged).length;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try { await fn(); setReloadTick(t => t + 1); }
    catch (e) { appAlert("Couldn't update alarms", errorText(e)); }
    finally { setBusy(null); }
  }

  const ackAll = () => { setOpen(null); run("ackAll", () => acknowledgeAlarm()); };
  const clearAll = () => appAlert(
    "Clear alarm history?",
    "Removes every alarm whose condition has gone. Alarms still present (an e-stop that is not reset, a device still offline) stay.",
    [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: () => run("clear", clearAlarms) }],
  );

  const helpEntry = helpCode ? byCode.get(helpCode) : undefined;

  const stats = (
    <View style={styles.statRow}>
      <StatTile label="Active" value={activeCount} icon={Bell}
        tint={activeCount > 0 ? [colors.danger, colors.dangerSoft] : [colors.success, colors.successSoft]}
        style={styles.stat} />
      <StatTile label="Faults" value={critical} icon={OctagonAlert}
        tint={critical > 0 ? [colors.danger, colors.dangerSoft] : [colors.textMuted, colors.background]}
        hint="critical + error" style={styles.stat} />
      <StatTile label="History" value={total} icon={CheckCheck} hint={`${unacked} unacknowledged`} style={styles.stat} />
    </View>
  );

  const helpCard = helpEntry ? (
    <HelpCard entry={helpEntry} onClose={() => setHelpCode(null)} />
  ) : helpCode && catalog.length > 0 ? (
    <Card style={styles.helpCard}>
      <Text style={type.title}>{helpCode}</Text>
      <Text style={[type.body, styles.helpText]}>A code the program raised itself. Read the program&apos;s message for what it detected.</Text>
    </Card>
  ) : null;

  const renderAlarm = (a: AlarmEntry) => (
    <AlarmCard
      key={a.id}
      alarm={a}
      help={byCode.get(a.code)}
      open={open === a.id}
      now={now}
      sourceText={sourceText(a, deviceName, pluginName)}
      onToggle={() => setOpen(o => (o === a.id ? null : a.id))}
      onAck={a.acknowledged ? undefined : () => {
        setOpen(o => (o === a.id ? null : o));   // acknowledging also collapses the card
        run(a.id, () => acknowledgeAlarm(a.id));
      }}
      acking={busy === a.id}
    />
  );

  const lists = (
    <>
      <SectionHeader
        title={`Active (${activeCount})`}
        icon={Bell}
        right={<InfoTip text="An alarm stays active until its condition has gone (the e-stop is reset, the device reconnects) and someone has acknowledged it. A program error only needs acknowledging." />}
      />
      {loading && alarms.length === 0 ? (
        <Card><ActivityIndicator color={colors.accent} /></Card>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={30} color={colors.success} />}
          title="No active alarms"
          subtitle="Program errors, stops, faults and device problems appear here."
        />
      ) : (
        <View style={styles.list}>{active.map(renderAlarm)}</View>
      )}

      <SectionHeader title="History" icon={CheckCheck} />
      {history.length === 0 ? (
        <EmptyState icon={<BellOff size={28} color={colors.textFaint} />} title="No history" subtitle="Acknowledged alarms that have cleared are kept here (the newest 500)." />
      ) : (
        <View style={styles.list}>{history.map(renderAlarm)}</View>
      )}
      {alarms.length < total && (
        <Button label={`Show more (${total - alarms.length} older)`} variant="secondary" onPress={() => setLimit(l => l + PAGE)} />
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title="Alarms"
        subtitle="Stops, faults and device problems, with what to do about each"
        right={
          <>
            <Button label="Acknowledge all" size="sm" variant="secondary" iconOnly={narrow}
              icon={<CheckCheck size={narrow ? 17 : 14} color={buttonTextColor("secondary")} />}
              loading={busy === "ackAll"} disabled={unacked === 0} onPress={ackAll} />
            <Button label="Clear history" size="sm" variant="dangerSoft" iconOnly={narrow}
              icon={<Trash2 size={narrow ? 17 : 14} color={buttonTextColor("dangerSoft")} />}
              loading={busy === "clear"} disabled={history.length === 0 && active.every(a => !a.cleared)} onPress={clearAll} />
          </>
        }
      />
      <Screen>
        {desktop ? (
          <View style={styles.wideRow}>
            <View style={styles.mainCol}>{lists}</View>
            <View style={styles.sideCol}>
              {stats}
              {helpCard}
              <CatalogCard catalog={catalog} selected={helpCode} onSelect={setHelpCode} defaultOpen />
            </View>
          </View>
        ) : (
          <>
            {stats}
            {helpCard}
            {lists}
            <CatalogCard catalog={catalog} selected={helpCode} onSelect={setHelpCode} />
          </>
        )}
      </Screen>
    </View>
  );
}

function sourceText(
  a: AlarmEntry,
  deviceName: (id?: string | null) => string | null,
  pluginName: (id?: string | null) => string | null,
): string | null {
  const s = a.source ?? {};
  if (s.programName) return `${s.background ? "Background program" : "Program"} ${s.programName}`;
  if (s.pluginId) return `Plugin ${pluginName(s.pluginId)}`;
  if (s.deviceId) return deviceName(s.deviceId);
  return null;
}

function AlarmCard({ alarm: a, help, open, now, sourceText: src, onToggle, onAck, acking }: {
  alarm: AlarmEntry; help?: AlarmCatalogEntry; open: boolean; now: number; sourceText: string | null;
  onToggle: () => void; onAck?: () => void; acking: boolean;
}) {
  const s = sev(a.severity);
  const Icon = s.icon;
  const state = !a.cleared
    ? <StatusPill label="Present" tone="danger" dot />
    : !a.acknowledged
    ? <StatusPill label="Unacknowledged" tone="warning" dot />
    : <StatusPill label="Cleared" tone="neutral" dot />;

  return (
    <Card padded={false} style={[styles.alarmCard, a.active && { borderLeftColor: s.fg }]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.alarmHead, pressed && styles.pressed]}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={[styles.sevTile, { backgroundColor: s.bg }]}><Icon size={18} color={s.fg} /></View>
        <View style={styles.alarmBody}>
          <View style={styles.titleRow}>
            <Text style={styles.alarmTitle} numberOfLines={2}>{a.title || help?.title || a.code}</Text>
            <View style={styles.codeChip}><Text style={styles.codeText} numberOfLines={1}>{a.code}</Text></View>
          </View>
          <Text style={styles.alarmMsg} numberOfLines={open ? undefined : 2}>{a.message}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{s.label} · {ago(a.timestampUnixMs, now)}</Text>
            {!!src && <Text style={styles.meta} numberOfLines={1}>· {src}</Text>}
          </View>
        </View>
        <View style={styles.alarmSide}>
          {state}
          {open ? <ChevronUp size={18} color={colors.textFaint} /> : <ChevronDown size={18} color={colors.textFaint} />}
        </View>
      </Pressable>

      {open && (
        <View style={styles.expand}>
          {help ? (
            <View style={styles.helpGrid}>
              <View style={styles.helpBlock}>
                <Text style={styles.helpLabel}>Cause</Text>
                <Text style={styles.helpText}>{help.cause}</Text>
              </View>
              <View style={[styles.helpBlock, styles.remedyBlock]}>
                <View style={styles.remedyHead}>
                  <Wrench size={13} color={colors.success} />
                  <Text style={[styles.helpLabel, { color: colors.success }]}>What to do</Text>
                </View>
                <Text style={styles.helpText}>{help.remedy}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.helpText}>A code the program raised itself. Its message describes what it detected.</Text>
          )}
          <View style={styles.expandFoot}>
            <Text style={styles.metaSmall}>
              Raised {stamp(a.timestampUnixMs)}
              {a.clearedUnixMs ? ` · cleared ${stamp(a.clearedUnixMs)}` : ""}
              {a.acknowledgedUnixMs ? ` · acknowledged ${stamp(a.acknowledgedUnixMs)}` : ""}
            </Text>
            {onAck && (
              <Button label="Acknowledge" size="sm" variant="secondary" loading={acking}
                icon={<CheckCheck size={14} color={buttonTextColor("secondary")} />} onPress={onAck} />
            )}
          </View>
        </View>
      )}
    </Card>
  );
}

function HelpCard({ entry, onClose }: { entry: AlarmCatalogEntry; onClose: () => void }) {
  const s = sev(entry.severity);
  const Icon = s.icon;
  return (
    <Card style={styles.helpCard}>
      <View style={styles.titleRow}>
        <View style={[styles.sevTile, { backgroundColor: s.bg }]}><Icon size={18} color={s.fg} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.title} numberOfLines={2}>{entry.title}</Text>
          <Text style={styles.meta}>{entry.code}{entry.catchable == null ? "" : entry.catchable ? " · a Try can catch it" : " · always ends the program"}</Text>
        </View>
        <Button label="Close" size="sm" variant="ghost" onPress={onClose} />
      </View>
      <Text style={styles.helpLabel}>Cause</Text>
      <Text style={styles.helpText}>{entry.cause}</Text>
      <Text style={[styles.helpLabel, { color: colors.success, marginTop: spacing.sm }]}>What to do</Text>
      <Text style={styles.helpText}>{entry.remedy}</Text>
    </Card>
  );
}

function CatalogCard({ catalog, selected, onSelect, defaultOpen = false }: {
  catalog: AlarmCatalogEntry[]; selected: string | null; onSelect: (code: string) => void; defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  if (catalog.length === 0) return null;
  return (
    <>
      <SectionHeader title="Alarm reference" icon={Info}
        right={<Button label={show ? "Hide" : `Show all ${catalog.length}`} size="sm" variant="ghost" onPress={() => setShow(v => !v)} />} />
      {show && (
        <Card padded={false}>
          {catalog.map((c, i) => {
            const s = sev(c.severity);
            return (
              <Pressable key={c.code} onPress={() => onSelect(c.code)}
                style={({ pressed }) => [styles.refRow, i > 0 && styles.refDivider, (pressed || selected === c.code) && styles.refSelected]}>
                <View style={[styles.dot, { backgroundColor: s.fg }]} />
                <Text style={styles.refTitle} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.refCode} numberOfLines={1}>{c.code}</Text>
              </Pressable>
            );
          })}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  wideRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  mainCol: { flex: 1, gap: spacing.md, minWidth: 0 },
  sideCol: { width: 380, gap: spacing.md },

  statRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  stat: { flexGrow: 1, flexBasis: 100 },

  list: { gap: spacing.sm },
  alarmCard: { borderLeftWidth: 4, borderLeftColor: colors.border, overflow: "hidden" },
  alarmHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md },
  pressed: { backgroundColor: colors.surfaceHover },
  sevTile: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  alarmBody: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  alarmTitle: { ...type.title, flexShrink: 1 },
  codeChip: { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 1 },
  codeText: { ...type.mono, fontSize: 11, color: colors.textMuted },
  alarmMsg: { ...type.body, lineHeight: 19 },
  metaRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 2 },
  meta: { ...type.caption, color: colors.textMuted },
  metaSmall: { ...type.caption, flex: 1, minWidth: 160 },
  alarmSide: { alignItems: "flex-end", gap: spacing.sm },

  expand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  helpGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  helpBlock: { flexGrow: 1, flexBasis: 240, gap: 4 },
  remedyBlock: { backgroundColor: colors.successSoft, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: colors.successBorder },
  remedyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  helpLabel: { ...type.sectionLabel, color: colors.textMuted },
  helpText: { ...type.body, lineHeight: 20, color: colors.textSecondary },
  expandFoot: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },

  helpCard: { gap: spacing.xs },

  refRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  refDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  refSelected: { backgroundColor: colors.accentSoft },
  dot: { width: 8, height: 8, borderRadius: 4 },
  refTitle: { ...type.body, color: colors.text, flex: 1 },
  refCode: { ...type.mono, fontSize: 11, color: colors.textFaint, maxWidth: "45%" },
});
