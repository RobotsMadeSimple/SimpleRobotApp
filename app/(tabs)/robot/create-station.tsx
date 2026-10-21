import { router } from "expo-router";
import { Check, ChevronDown, Nfc, Router as RouterIcon, Share2, WifiOff, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import {
  Button, Card, colors, Divider, EmptyState, FormRow, Input, PageHeader, radii, Screen, SectionHeader, SegmentedControl, spacing, type,
} from "@/src/components/ui/kit";
import { StationQr } from "@/src/components/station/StationQr";
import { useBuiltPrograms, useProgramSummaries, useSelectedRobot } from "@/src/providers/RobotProvider";
import { nfcIsSupported, writeStationUri } from "@/src/services/stationNfc";
import {
  buildStationUri, DEFAULT_CONTROL_PORT, goLabel, GO_OPTIONS, hasAction, normalizeLink, type StationGo, type StationRunKind,
} from "@/src/services/stationLink";

const RUN_KIND_LABEL: Record<StationRunKind, string> = {
  program: "Program", routine: "Routine", background: "Background",
};
type RunItem = { name: string; id?: string };

type GoChoice = StationGo | "none";
const GO_SEGMENTS: { label: string; value: GoChoice }[] = [
  { label: "None", value: "none" },
  ...GO_OPTIONS.map(g => ({ label: goLabel(g), value: g as GoChoice })),
];

export default function CreateStation() {
  // The tag is always for the robot you're connected to — its IP/port fill in behind the scenes, so
  // there's no address to type. Requires a connection.
  const robot = useSelectedRobot();
  const host  = robot?.ipAddress ?? "";
  const port  = robot?.port;
  const robotLabel = robot?.robotName && robot.robotName !== "Manual" ? robot.robotName : host;

  const [name, setName]   = useState(robot?.robotName && robot.robotName !== "Manual" ? robot.robotName : "");
  const [go, setGo]       = useState<GoChoice>("program");
  const [run, setRun]     = useState("");                       // program NAME (display / fallback)
  const [runId, setRunId] = useState<string | undefined>(undefined); // program ID (rename-proof link)
  const [runKind, setRunKind] = useState<StationRunKind>("program");
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [nfcOk, setNfcOk] = useState(false);
  const [writing, setWriting] = useState(false);

  useEffect(() => { nfcIsSupported().then(setNfcOk).catch(() => setNfcOk(false)); }, []);

  // Programs / background programs on the connected robot, grouped for the run picker. Each entry
  // carries the program's stable id (the link) plus its name (display); external robot-only programs
  // have no id and fall back to name. Routines are excluded (they run via a Call Routine step).
  const builtPrograms    = useBuiltPrograms();
  const programSummaries = useProgramSummaries();
  const runGroups = useMemo(() => {
    const builtNames = new Set(builtPrograms.map(p => p.name));
    const dedupeByName = (xs: RunItem[]) => {
      const seen = new Set<string>();
      return xs.filter(x => (seen.has(x.name) ? false : (seen.add(x.name), true)))
               .sort((a, b) => a.name.localeCompare(b.name));
    };
    return [
      { kind: "program" as StationRunKind, label: "Programs", items: dedupeByName([
        ...builtPrograms.filter(p => !p.isRoutine && !p.isBackground).map(p => ({ name: p.name, id: p.id })),
        ...programSummaries.filter(p => !builtNames.has(p.name)).map(p => ({ name: p.name, id: undefined as string | undefined })),
      ]) },
      { kind: "background" as StationRunKind, label: "Background Programs", items:
        dedupeByName(builtPrograms.filter(p => p.isBackground).map(p => ({ name: p.name, id: p.id }))) },
    ];
  }, [builtPrograms, programSummaries]);

  const link = useMemo(() => normalizeLink({
    host,
    port: port && port !== DEFAULT_CONTROL_PORT ? port : undefined,
    go: go === "none" ? undefined : go,
    run,
    runId,
    runKind,
    name,
    confirm,
  }), [host, port, go, run, runId, runKind, name, confirm]);

  const uri = useMemo(() => buildStationUri(link), [link]);
  const ready = hasAction(link);

  async function shareLink() {
    if (Platform.OS === "web") {
      try { await (navigator as any)?.clipboard?.writeText(uri); appAlert("Copied", "Station link copied to the clipboard."); }
      catch { appAlert("Station link", uri); }
      return;
    }
    try { await Share.share({ message: uri }); } catch { /* user dismissed */ }
  }

  async function writeTag() {
    if (writing) return;
    setWriting(true);
    try {
      await writeStationUri(uri);
      appAlert("Tag written", "Hold a phone to this tag to connect to the station.");
    } catch (e: any) {
      appAlert("Couldn't write tag", e?.message || "Hold the tag steady against the phone and try again.");
    } finally {
      setWriting(false);
    }
  }

  // The tag has to carry a controller address, and we take that from the live connection rather than
  // making the user type it — so creating a tag requires being connected.
  if (!robot) {
    return (
      <View style={styles.container}>
        <PageHeader title="Create station tag" subtitle="Tag the robot you're connected to" backTo="/robot" />
        <Screen>
          <EmptyState
            icon={<WifiOff size={32} color={colors.textFaint} />}
            title="Connect to a robot first"
            subtitle="A station tag points at a specific controller. Connect to the robot you want to tag, then come back here — its address fills in automatically."
          />
          <Button label="Go to connect" icon={<RouterIcon size={16} color={colors.onAccent} />} onPress={() => router.navigate("/robot")} style={styles.connectBtn} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Create station tag"
        subtitle="Build a link, then save its QR code or write it to an NFC tag"
        backTo="/robot"
      />
      <Screen>
        <SectionHeader title="Station" />
        <Card style={styles.stack}>
          <FormRow label="Station name" hint="Shown when the tag is used (e.g. “Weld Cell”).">
            <Input value={name} onChangeText={setName} placeholder="Weld Cell" autoCapitalize="words" />
          </FormRow>
          <Divider />
          <View style={styles.targetRow}>
            <RouterIcon size={16} color={colors.textFaint} />
            <Text style={styles.targetText} numberOfLines={1}>
              Connects to <Text style={styles.targetName}>{robotLabel}</Text> · {host}:{port ?? DEFAULT_CONTROL_PORT}
            </Text>
          </View>
        </Card>

        <SectionHeader title="Action" />
        <Card style={styles.stack}>
          <FormRow label="Open page" hint="Where to land after connecting.">
            <SegmentedControl options={GO_SEGMENTS} value={go} onChange={setGo} />
          </FormRow>
          <Divider />
          <FormRow label="Run on connect" hint="Optional — auto-start a program, routine or background program once connected.">
            <TouchableOpacity style={styles.selectBtn} onPress={() => setRunPickerOpen(true)} activeOpacity={0.75}>
              <Text style={[styles.selectText, !run && styles.selectPlaceholder]} numberOfLines={1}>
                {run ? `${RUN_KIND_LABEL[runKind]} · ${run}` : "Nothing (just connect)"}
              </Text>
              <ChevronDown size={16} color={colors.textFaint} />
            </TouchableOpacity>
          </FormRow>
          <Divider />
          <FormRow label="Confirm first" hint="Ask before acting instead of firing instantly." inline>
            <Switch value={confirm} onValueChange={setConfirm} trackColor={{ false: colors.border, true: colors.success }} />
          </FormRow>
        </Card>

        <SectionHeader title="Tag" />
        <Card style={styles.stack}>
          {ready ? (
            <>
              <StationQr value={uri} />
              <Text style={styles.uri} selectable numberOfLines={2}>{uri}</Text>
              <View style={styles.actions}>
                <Button label="Share link" variant="secondary" size="sm" icon={<Share2 size={16} color={colors.textSecondary} />} onPress={shareLink} style={styles.actionBtn} />
                {nfcOk && (
                  writing
                    ? <View style={[styles.actionBtn, styles.writing]}><ActivityIndicator color={colors.accent} /><Text style={styles.writingText}>Hold a tag…</Text></View>
                    : <Button label="Write NFC tag" size="sm" icon={<Nfc size={16} color={colors.onAccent} />} onPress={writeTag} style={styles.actionBtn} />
                )}
              </View>
              {nfcOk && !writing && (
                <Text style={type.caption}>Blank NTAG-style stickers work best. Writing replaces whatever the tag held.</Text>
              )}
            </>
          ) : (
            <Text style={styles.hint}>Enter a controller IP (or an action) to generate a tag.</Text>
          )}
        </Card>
      </Screen>

      <Modal visible={runPickerOpen} transparent animationType="fade" onRequestClose={() => setRunPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setRunPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Run on connect</Text>
              <TouchableOpacity onPress={() => setRunPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="always" bounces={false}>
              <TouchableOpacity
                style={styles.optRow}
                onPress={() => { setRun(""); setRunId(undefined); setRunKind("program"); setRunPickerOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.optText, !run && styles.optTextActive]} numberOfLines={1}>Nothing (just connect)</Text>
                {!run && <Check size={16} color={colors.accent} />}
              </TouchableOpacity>

              {runGroups.map(g => (
                <View key={g.kind}>
                  <Text style={styles.groupLabel}>{g.label.toUpperCase()}</Text>
                  {g.items.length === 0 ? (
                    <Text style={styles.groupEmpty}>None saved on this robot</Text>
                  ) : g.items.map(item => {
                    // Active match by id when present (rename-proof), else by name.
                    const active = runKind === g.kind && (item.id ? runId === item.id : (!runId && run === item.name));
                    return (
                      <TouchableOpacity
                        key={g.kind + ":" + (item.id ?? item.name)}
                        style={styles.optRow}
                        onPress={() => { setRun(item.name); setRunId(item.id); setRunKind(g.kind); setRunPickerOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.optText, active && styles.optTextActive]} numberOfLines={1}>{item.name}</Text>
                        {active && <Check size={16} color={colors.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
  connectBtn: { marginTop: spacing.lg, alignSelf: "center" },
  targetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  targetText: { flex: 1, ...type.caption, color: colors.textSecondary },
  targetName: { color: colors.text, fontWeight: "600" },
  uri: { ...type.mono, fontSize: 12, color: colors.textFaint, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1 },
  writing: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  writingText: { ...type.body, color: colors.accent },
  hint: { ...type.body, color: colors.textFaint, textAlign: "center" },

  // Run-on-connect selector button
  selectBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10,
  },
  selectText: { flex: 1, ...type.body, color: colors.text, fontWeight: "600" },
  selectPlaceholder: { color: colors.textFaint, fontWeight: "400" },

  // Picker modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sheetTitle: { ...type.title },
  sheetScroll: { maxHeight: 420 },
  optRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  optText: { flex: 1, ...type.body, color: colors.text },
  optTextActive: { color: colors.accent, fontWeight: "700" },
  groupLabel: { ...type.caption, color: colors.textFaint, fontWeight: "700", letterSpacing: 0.5, marginTop: spacing.md, marginBottom: 2 },
  groupEmpty: { ...type.caption, color: colors.textFaint, paddingVertical: spacing.sm },
});
