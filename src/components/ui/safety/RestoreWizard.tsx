import * as DocumentPicker from "expo-document-picker";
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileArchive, Puzzle, RotateCcw, Upload, X, XCircle,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, buttonTextColor, colors, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import type { RestorePreview, RestoreResult } from "@/src/models/safetyModels";
import { useRobotStatusValue } from "@/src/providers/RobotProvider";
import { applyRestore, errorText, previewRestore } from "@/src/services/safetyApi";

// Restore runs as a modal flow, one step at a time: pick a backup file → review what it replaces →
// confirm → result. Nothing changes on the controller until the confirm step's button.
// Mount it only while open (`{open && <RestoreWizard … />}`) so every run starts fresh.

type Step = "pick" | "preview" | "confirm" | "result";
const STEPS: { key: Step; label: string }[] = [
  { key: "pick", label: "Choose file" },
  { key: "preview", label: "Review" },
  { key: "confirm", label: "Confirm" },
  { key: "result", label: "Done" },
];

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function RestoreWizard({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Busy hints for the confirm step — the controller refuses too (409) if anything runs.
  const moving = useRobotStatusValue(s => s.moving);
  const running = useRobotStatusValue(s =>
    s.programs.some(p => p.status === "Running") || (s.backgroundPrograms?.length ?? 0) > 0);

  async function pick() {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const a = picked.assets[0];
      setFile({ uri: a.uri, name: a.name, size: a.size ?? undefined });
      setBusy(true);
      try {
        setPreview(await previewRestore(a.uri));
        setStep("preview");
      } catch (e) {
        setPreview(null);
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await applyRestore(file.uri));
      setStep("result");
    } catch (e) {
      setError(errorText(e));
      setStep("result");
    } finally {
      setBusy(false);
    }
  }

  const index = STEPS.findIndex(s => s.key === step);
  const m = preview?.manifest;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <View style={styles.scrim}>
        <View style={styles.card} testID="restore-wizard">
          {/* Header + progress */}
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Restore backup · step {index + 1} of {STEPS.length}</Text>
              <Text style={styles.title}>{STEPS[index].label}</Text>
            </View>
            {step !== "result" && (
              <Pressable onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel="Close">
                <X size={20} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <View style={styles.progress}>
            {STEPS.map((s, i) => (
              <View key={s.key} style={[styles.bar, i <= index && styles.barOn]} />
            ))}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {step === "pick" && (
              <>
                <Text style={styles.lead}>
                  Choose a controller backup (.zip). It is checked first — nothing on the controller changes until you confirm.
                </Text>
                <Pressable onPress={pick} disabled={busy} style={({ pressed }) => [styles.drop, pressed && styles.dropPressed]}>
                  {busy ? <ActivityIndicator color={colors.accent} /> : <Upload size={26} color={colors.accent} />}
                  <Text style={styles.dropTitle}>{busy ? "Checking backup…" : file ? "Choose a different file" : "Choose backup file"}</Text>
                  {!!file && <Text style={styles.dropSub} numberOfLines={1}>{file.name}{file.size ? ` · ${bytes(file.size)}` : ""}</Text>}
                </Pressable>
                {!!error && <Problem text={error} />}
              </>
            )}

            {step === "preview" && preview && m && (
              <>
                <View style={styles.fileRow}>
                  <View style={styles.fileIcon}><FileArchive size={20} color={colors.accent} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.title} numberOfLines={1}>{m.robotName || "Controller"} backup</Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {m.createdUnixMs ? new Date(m.createdUnixMs).toLocaleString() : "Unknown date"}
                      {m.robotType ? ` · ${m.robotType}` : ""}{m.serialNumber ? ` · ${m.serialNumber}` : ""}
                      {m.controllerVersion ? ` · v${m.controllerVersion}` : ""}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>What will be replaced</Text>
                <View style={styles.table}>
                  <View style={[styles.tr, styles.th]}>
                    <Text style={[styles.td, styles.tdLabel, styles.thText]}>Data</Text>
                    <Text style={[styles.td, styles.tdNum, styles.thText]}>Now</Text>
                    <Text style={[styles.tdArrow]} />
                    <Text style={[styles.td, styles.tdNum, styles.thText]}>Backup</Text>
                  </View>
                  {preview.categories.map((c, i) => {
                    const removed = c.backup === 0 && c.current > 0;
                    return (
                      <View key={c.key} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
                        <Text style={[styles.td, styles.tdLabel]} numberOfLines={1}>{c.label}</Text>
                        <Text style={[styles.td, styles.tdNum]}>{c.current}</Text>
                        <ArrowRight size={13} color={colors.textFaint} style={styles.tdArrow} />
                        <Text style={[styles.td, styles.tdNum, removed && { color: colors.danger, fontWeight: "700" }]}>{c.backup}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.meta}>{preview.fileCount} files · {bytes(preview.totalBytes)}. Data not in the backup is removed, so the controller matches it.</Text>

                {preview.missingPlugins.length > 0 && (
                  <View style={styles.note}>
                    <Puzzle size={16} color={colors.warning} />
                    <Text style={styles.noteText}>
                      Not installed here: {preview.missingPlugins.map(p => `${p.name ?? p.id}${p.version ? ` ${p.version}` : ""}`).join(", ")}. Their settings are restored; install the plugins to use them.
                    </Text>
                  </View>
                )}
                {preview.warnings.filter(w => !/plugin\(s\) in the backup are not installed/.test(w)).map(w => (
                  <View key={w} style={styles.note}>
                    <AlertTriangle size={16} color={colors.warning} />
                    <Text style={styles.noteText}>{w}</Text>
                  </View>
                ))}
              </>
            )}

            {step === "confirm" && preview && (
              <>
                <View style={[styles.note, styles.noteDanger]}>
                  <AlertTriangle size={18} color={colors.danger} />
                  <Text style={styles.noteText}>
                    This replaces the programs, points, tools, frames, configuration and settings on the controller with the backup&apos;s. It can&apos;t be undone here — but a backup of the current data is saved on the controller first.
                  </Text>
                </View>
                <Text style={styles.lead}>When it finishes, the controller restarts to load the restored data and the app reconnects. Home the robot afterwards.</Text>
                {(running || moving) && <Problem text="A program is running or the robot is moving. Stop it first — the controller refuses to restore while anything runs." />}
                {!!error && <Problem text={error} />}
              </>
            )}

            {step === "result" && (
              result?.applied ? (
                <View style={styles.result}>
                  <CheckCircle2 size={44} color={colors.success} />
                  <Text style={styles.resultTitle}>Restored</Text>
                  <Text style={styles.lead}>
                    {result.filesWritten ?? 0} files restored. The controller is restarting and the app will reconnect in a few seconds.
                  </Text>
                  {!!result.preRestoreBackup && (
                    <Text style={styles.meta}>The data from before is saved on the controller as {result.preRestoreBackup}.</Text>
                  )}
                  <Text style={styles.meta}>Home the robot before running programs.</Text>
                </View>
              ) : (
                <View style={styles.result}>
                  <XCircle size={44} color={colors.danger} />
                  <Text style={styles.resultTitle}>Restore failed</Text>
                  <Text style={styles.lead}>{error ?? "The controller did not restore the backup."}</Text>
                  <Text style={styles.meta}>Nothing was changed.</Text>
                </View>
              )
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.foot}>
            {step === "pick" && (
              <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footBtn} />
            )}
            {step === "preview" && (
              <>
                <Button label="Back" variant="secondary" onPress={() => setStep("pick")} style={styles.footBtn} />
                <Button label="Continue" onPress={() => setStep("confirm")} style={styles.footBtn} />
              </>
            )}
            {step === "confirm" && (
              <>
                <Button label="Back" variant="secondary" onPress={() => setStep("preview")} disabled={busy} style={styles.footBtn} />
                <Button label="Restore and restart" variant="destructive" loading={busy} onPress={apply}
                  icon={<RotateCcw size={15} color={buttonTextColor("destructive")} />} style={styles.footBtn} />
              </>
            )}
            {step === "result" && (
              <>
                {!result?.applied && <Button label="Back" variant="secondary" onPress={() => { setError(null); setStep("confirm"); }} style={styles.footBtn} />}
                <Button label="Close" onPress={onClose} style={styles.footBtn} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <View style={[styles.note, styles.noteDanger]}>
      <XCircle size={16} color={colors.danger} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%", maxWidth: 560, maxHeight: "92%",
    backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.raised, overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  kicker: { ...type.caption, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", color: colors.textMuted },
  title: { ...type.pageTitle, marginTop: 2 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  barOn: { backgroundColor: colors.accent },
  body: { flexGrow: 0 },
  bodyContent: { padding: spacing.xl, gap: spacing.md },
  lead: { ...type.body, lineHeight: 20 },
  meta: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  sectionLabel: { ...type.sectionLabel, marginTop: spacing.xs },

  drop: {
    alignItems: "center", justifyContent: "center", gap: spacing.sm,
    minHeight: 150, borderRadius: radii.lg, borderWidth: 2, borderStyle: "dashed", borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft, padding: spacing.lg,
  },
  dropPressed: { opacity: 0.8 },
  dropTitle: { ...type.title, color: colors.accent },
  dropSub: { ...type.caption, color: colors.textMuted, maxWidth: "90%" },

  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  fileIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },

  table: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 7 },
  trAlt: { backgroundColor: colors.surfaceMuted },
  th: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  thText: { ...type.caption, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  td: { ...type.body, color: colors.text },
  tdLabel: { flex: 1 },
  tdNum: { width: 56, textAlign: "right", fontVariant: ["tabular-nums"] },
  tdArrow: { width: 22, marginLeft: 6 },

  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder },
  noteDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  noteText: { ...type.body, flex: 1, lineHeight: 19, color: colors.textSecondary },

  result: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  resultTitle: { ...type.pageTitle },

  foot: {
    flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end",
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  footBtn: { minWidth: 120 },
});
