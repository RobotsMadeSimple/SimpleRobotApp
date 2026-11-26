import {
  Box, CircuitBoard, CodeXml, Database, Download, Eye, FileArchive, Grid3x3, Layers,
  MapPin, Puzzle, RotateCcw, Settings2, ShieldCheck, Wrench, type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import {
  Button, buttonTextColor, Card, colors, InfoTip, PageHeader, radii, Screen, SectionHeader, spacing, type,
} from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { RestoreWizard } from "@/src/components/ui/safety/RestoreWizard";
import { useRobotStatusValue, useSelectedRobot } from "@/src/providers/RobotProvider";
import { downloadBackup, errorText } from "@/src/services/safetyApi";

// Whole-controller backup (GET /backup) and restore (POST /backup/restore, as a modal wizard).

const INCLUDED: { icon: LucideIcon; label: string; detail: string }[] = [
  { icon: CodeXml,      label: "Programs",            detail: "with revisions, images and display pages" },
  { icon: MapPin,       label: "Points, tools, locals", detail: "with their edit history" },
  { icon: Grid3x3,      label: "Grids and stacks",    detail: "" },
  { icon: Settings2,    label: "Robot configuration", detail: "homing, motors, limits, e-stop" },
  { icon: CircuitBoard, label: "Device settings",     detail: "IO boards, aux axes, relay, cameras, phones" },
  { icon: Eye,          label: "Vision",              detail: "vision programs and camera calibrations" },
  { icon: Box,          label: "Cell packages",       detail: "3D cell models" },
  { icon: Database,     label: "Persistent variables", detail: "" },
  { icon: Puzzle,       label: "Plugin settings",     detail: "plugins themselves are listed, not included" },
];

export default function BackupRestore() {
  const robot = useSelectedRobot();
  const version = useRobotStatusValue(s => s.version);
  const desktop = usePaneLayout() === "desktop";
  const [downloading, setDownloading] = useState(false);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      setLastFile(await downloadBackup());
    } catch (e) {
      appAlert("Backup failed", errorText(e));
    } finally {
      setDownloading(false);
    }
  }

  const backupCard = (
    <>
      <SectionHeader title="Back up" icon={Download}
        right={<InfoTip text="One zip of everything you made on this controller. Keep it somewhere safe; restore it here or onto a replacement controller." />} />
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.tile, { backgroundColor: colors.accentSoft }]}><FileArchive size={22} color={colors.accent} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.title}>Download a backup</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {robot?.robotName ? `${robot.robotName}` : "This controller"}{version && version !== "0.0.0" ? ` · v${version}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.included}>
          {INCLUDED.map(({ icon: Icon, label, detail }) => (
            <View key={label} style={styles.incRow}>
              <Icon size={15} color={colors.textMuted} />
              <Text style={styles.incLabel}>{label}</Text>
              {!!detail && <Text style={styles.incDetail} numberOfLines={2}>{detail}</Text>}
            </View>
          ))}
        </View>
        <Text style={styles.note}>Not included: logs, IO history samples, the alarm log, the controller&apos;s identity and plugin programs.</Text>
        <Button label={downloading ? "Preparing…" : "Download backup"} loading={downloading} onPress={download}
          icon={<Download size={16} color={buttonTextColor("primary")} />} />
        {!!lastFile && (
          <View style={styles.done}>
            <ShieldCheck size={15} color={colors.success} />
            <Text style={styles.doneText} numberOfLines={2}>Saved {lastFile}</Text>
          </View>
        )}
      </Card>
    </>
  );

  const restoreCard = (
    <>
      <SectionHeader title="Restore" icon={RotateCcw}
        right={<InfoTip text="Restoring replaces this controller's data with the backup's. You review exactly what changes before confirming, and the current data is saved on the controller first." />} />
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.tile, { backgroundColor: colors.warningSoft }]}><RotateCcw size={22} color={colors.warning} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.title}>Restore from a backup</Text>
            <Text style={styles.sub}>Step by step: choose, review, confirm</Text>
          </View>
        </View>
        <View style={styles.steps}>
          {[
            ["1", "Choose the backup file", "It is checked before anything changes."],
            ["2", "Review", "See what is replaced, item counts now and in the backup, and any plugins to reinstall."],
            ["3", "Confirm", "The current data is saved as a pre-restore backup, then the controller restarts with the restored data."],
          ].map(([n, t, d]) => (
            <View key={n} style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{t}</Text>
                <Text style={styles.stepDetail}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.warnRow}>
          <Wrench size={14} color={colors.textMuted} />
          <Text style={styles.note}>Stop programs first. Home the robot after restoring.</Text>
        </View>
        <Button label="Restore from file…" variant="secondary" onPress={() => setWizard(true)}
          icon={<Layers size={16} color={buttonTextColor("secondary")} />} />
      </Card>
    </>
  );

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader title="Backup & Restore" subtitle="Save everything on this controller to one file, or restore it" />
      <Screen>
        {desktop ? (
          <View style={styles.wideRow}>
            <View style={styles.col}>{backupCard}</View>
            <View style={styles.col}>{restoreCard}</View>
          </View>
        ) : (
          <>
            {backupCard}
            {restoreCard}
          </>
        )}
      </Screen>
      {wizard && <RestoreWizard visible onClose={() => setWizard(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  wideRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  col: { flex: 1, gap: spacing.md, minWidth: 0 },
  card: { gap: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tile: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  sub: { ...type.subtitle, marginTop: 2 },
  included: { gap: 2, backgroundColor: colors.surfaceMuted, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  incRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  incLabel: { ...type.body, color: colors.text, fontWeight: "500" },
  incDetail: { ...type.caption, color: colors.textFaint, flex: 1 },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 16, flex: 1 },
  done: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  doneText: { ...type.caption, color: colors.success, flex: 1 },
  steps: { gap: spacing.md },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  stepTitle: { ...type.title, fontSize: 14 },
  stepDetail: { ...type.caption, color: colors.textMuted, lineHeight: 16, marginTop: 1 },
  warnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
