import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ArrowLeft, ChevronRight, RotateCcw } from "lucide-react-native";
import { BuiltProgram, ProgramRevision } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Button, buttonTextColor, colors, radii, spacing } from "@/src/components/ui/kit";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ms).toLocaleDateString();
}

type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "unsupported" } | { state: "error"; message: string };

/**
 * The controller's saved revisions of one program. Pick one to see what it held,
 * then restore it; the builder reloads the restored program as an undoable edit.
 */
export function RevisionsSheet({ visible, programName, hasUnsavedChanges, onClose, onRestored }: {
  visible: boolean;
  programName: string;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onRestored: (program: BuiltProgram) => void;
}) {
  const [list, setList]         = useState<Load<ProgramRevision[]>>({ state: "loading" });
  const [selected, setSelected] = useState<ProgramRevision | null>(null);
  const [detail, setDetail]     = useState<Load<BuiltProgram>>({ state: "loading" });
  const [restoring, setRestoring] = useState(false);

  // Reset on close (not on open) so the effects below only fetch.
  function close() {
    setSelected(null);
    setList({ state: "loading" });
    onClose();
  }

  function select(rev: ProgramRevision) {
    setDetail({ state: "loading" });
    setSelected(rev);
  }

  useEffect(() => {
    if (!visible) return;
    let live = true;
    robotClient.getBuiltProgramRevisions(programName)
      .then(value => { if (live) setList({ state: "ready", value }); })
      .catch(e => { if (live) setList(loadError(e)); });
    return () => { live = false; };
  }, [visible, programName]);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    robotClient.getBuiltProgramRevision(programName, selected.id)
      .then(value => { if (live) setDetail({ state: "ready", value }); })
      .catch(e => { if (live) setDetail(loadError(e)); });
    return () => { live = false; };
  }, [selected, programName]);

  function confirmRestore(rev: ProgramRevision) {
    appAlert(
      "Restore Revision",
      `Replace "${programName}" on the robot with the version saved ${relativeTime(rev.savedUnixMs)}? ` +
      "The current version is kept as a revision" +
      (hasUnsavedChanges ? ", and your unsaved edits here are replaced (Undo brings them back)." : "."),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", onPress: () => { void restore(rev); } },
      ],
    );
  }

  async function restore(rev: ProgramRevision) {
    setRestoring(true);
    try {
      const program = await robotClient.restoreBuiltProgramRevision(programName, rev.id);
      onRestored(program);
      close();
    } catch (e) {
      appAlert("Restore Failed", e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={close} title={selected ? "Revision" : "History"}>
      {selected ? (
        <RevisionDetail
          revision={selected}
          detail={detail}
          restoring={restoring}
          onBack={() => setSelected(null)}
          onRestore={() => confirmRestore(selected)}
        />
      ) : list.state === "loading" ? (
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      ) : list.state === "unsupported" ? (
        <Text style={styles.empty}>This controller does not keep program history. Update it to get revisions.</Text>
      ) : list.state === "error" ? (
        <Text style={styles.error}>{list.message}</Text>
      ) : list.value.length === 0 ? (
        <Text style={styles.empty}>No earlier versions yet. A revision is stored each time a changed program is saved.</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {list.value.map((r, i) => (
            <TouchableOpacity key={r.id} style={[styles.row, i < list.value.length - 1 && styles.rowBorder]}
              onPress={() => select(r)} activeOpacity={0.7}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{relativeTime(r.savedUnixMs)}</Text>
                <Text style={styles.rowDesc}>
                  {plural(r.stepCount, "step")} · {plural(r.variableCount, "variable")}{r.note ? ` · ${r.note}` : ""}
                </Text>
              </View>
              <ChevronRight size={15} color={colors.textFaint} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function RevisionDetail({ revision, detail, restoring, onBack, onRestore }: {
  revision: ProgramRevision;
  detail: Load<BuiltProgram>;
  restoring: boolean;
  onBack: () => void;
  onRestore: () => void;
}) {
  return (
    <View>
      <TouchableOpacity style={styles.back} onPress={onBack} hitSlop={8} activeOpacity={0.7}>
        <ArrowLeft size={15} color={colors.accent} />
        <Text style={styles.backText}>All revisions</Text>
      </TouchableOpacity>
      <Text style={styles.rowTitle}>{new Date(revision.savedUnixMs).toLocaleString()}</Text>
      <Text style={styles.rowDesc}>{relativeTime(revision.savedUnixMs)}{revision.note ? ` · ${revision.note}` : ""}</Text>

      {detail.state === "loading" && <ActivityIndicator style={styles.spinner} color={colors.accent} />}
      {detail.state === "error" && <Text style={styles.error}>{detail.message}</Text>}
      {detail.state === "ready" && (
        <View style={styles.summary}>
          <SummaryLine label="Name" value={detail.value.name} />
          <SummaryLine label="Description" value={detail.value.description || "—"} />
          <SummaryLine label="Steps" value={String(detail.value.steps.length)} />
          <SummaryLine label="Variables" value={String(detail.value.variables?.length ?? 0)} />
        </View>
      )}

      <Button
        label="Restore This Version"
        icon={<RotateCcw size={15} color={buttonTextColor("primary")} />}
        loading={restoring}
        disabled={detail.state !== "ready"}
        onPress={onRestore}
        style={styles.restore}
      />
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function loadError(e: unknown): Load<never> {
  if (isUnsupportedCommand(e)) return { state: "unsupported" };
  return { state: "error", message: e instanceof Error ? e.message : String(e) };
}

const styles = StyleSheet.create({
  spinner:   { paddingVertical: spacing.xl },
  empty:     { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg, lineHeight: 18 },
  error:     { fontSize: 13, color: colors.danger, paddingVertical: spacing.md },
  list:      { maxHeight: 420 },
  row:       { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText:   { flex: 1, minWidth: 0 },
  rowTitle:  { fontSize: 15, fontWeight: "600", color: colors.text },
  rowDesc:   { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  back:      { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.md },
  backText:  { fontSize: 13, fontWeight: "600", color: colors.accent },
  summary: {
    marginTop: spacing.md, padding: spacing.md, gap: spacing.sm,
    borderRadius: radii.md, backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryLine:  { flexDirection: "row", gap: spacing.md },
  summaryLabel: { width: 90, fontSize: 12, fontWeight: "600", color: colors.textMuted },
  summaryValue: { flex: 1, fontSize: 13, color: colors.text },
  restore:      { marginTop: spacing.lg },
});
