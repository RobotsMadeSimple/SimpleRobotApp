import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AlertCircle, AlertTriangle, FileCode } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Button, Input, SegmentedControl, colors, spacing } from "@/src/components/ui/kit";
import type { BuiltProgram, TextProblem } from "@/src/models/robotModels";
import { isNotImplementedCommand, isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { readSrsProgramMeta } from "@/src/services/srsFile";

type Kind = "program" | "routine" | "background";

/**
 * Import a program from a Simple Robot Script file (.srs — controller docs/program-language.md
 * §6.12): the controller parses the text with no base, then the user confirms a name and kind
 * (pre-filled from the file's `@program` header) and it is saved as a new program. Names that do
 * not resolve on this robot stay as names and show as warnings — teach those points afterwards.
 * Text with parse errors cannot be imported.
 */
export function ImportProgramTextSheet({ file, existingNames, onClose, onImported }: {
  /** The picked file; null = closed. */
  file: { fileName: string; text: string } | null;
  existingNames: string[];
  onClose: () => void;
  onImported: (name: string) => void;
}) {
  return (
    <BottomSheet visible={!!file} onClose={onClose} title="Import program text">
      {file && <ImportBody key={file.fileName + file.text.length} file={file} existingNames={existingNames} onClose={onClose} onImported={onImported} />}
    </BottomSheet>
  );
}

function ImportBody({ file, existingNames, onClose, onImported }: {
  file: { fileName: string; text: string };
  existingNames: string[];
  onClose: () => void;
  onImported: (name: string) => void;
}) {
  const meta = useMemo(() => readSrsProgramMeta(file.text), [file]);
  const [parsing, setParsing] = useState(true);
  const [parsed, setParsed] = useState<{ ok: boolean; program?: BuiltProgram; problems: TextProblem[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [name, setName] = useState(() => meta?.name || file.fileName.replace(/\.[^.]+$/, ""));
  const [kind, setKind] = useState<Kind>(() => (meta?.isBackground ? "background" : meta?.isRoutine ? "routine" : "program"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    robotClient.parseProgramText(file.text, { validate: true })
      .then(r => { if (live) setParsed(r); })
      .catch(e => {
        if (!live) return;
        setFailure(isNotImplementedCommand(e) || isUnsupportedCommand(e)
          ? "This controller cannot read program text yet."
          : e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (live) setParsing(false); });
    return () => { live = false; };
  }, [file]);

  const trimmed = name.trim();
  const taken = existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase());
  // Only parse errors block the import; validation problems (points to teach, …) are fixed later.
  const errors = parsed?.problems.filter(p => p.severity === "error" && p.source === "parse") ?? [];
  const later = new Set((parsed?.problems ?? []).filter(p => !(p.severity === "error" && p.source === "parse")).map(p => `${p.line}:${p.code}`));
  const stepCount = parsed?.program?.steps?.length ?? 0;
  const canImport = !!parsed?.ok && !!parsed.program && errors.length === 0
    && trimmed.length > 0 && !taken && !saving;

  const doImport = async () => {
    if (!parsed?.program) return;
    setSaving(true);
    try {
      await robotClient.saveBuiltProgram({
        ...parsed.program,
        id: "",
        name: trimmed,
        description: parsed.program.description || meta?.description || "",
        isRoutine: kind === "routine",
        isBackground: kind === "background",
        editorMode: "text",
      });
      onImported(trimmed);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.fileRow}>
        <FileCode size={16} color={colors.textMuted} />
        <Text style={styles.fileName} numberOfLines={1}>{file.fileName}</Text>
        {parsing ? <ActivityIndicator size="small" color={colors.accent} />
          : parsed ? <Text style={styles.fileMeta}>{`${stepCount} step${stepCount === 1 ? "" : "s"}`}</Text> : null}
      </View>

      <Text style={styles.label}>NAME</Text>
      <Input value={name} onChangeText={setName} placeholder="Program name" autoCapitalize="none" autoCorrect={false} />
      {taken && <Text style={styles.warnText}>A program with this name already exists — choose another name.</Text>}

      <Text style={styles.label}>KIND</Text>
      <SegmentedControl<Kind>
        options={[{ label: "Program", value: "program" }, { label: "Routine", value: "routine" }, { label: "Background", value: "background" }]}
        value={kind}
        onChange={setKind}
        size="sm"
      />

      {failure && (
        <View style={styles.problem}>
          <AlertCircle size={14} color={colors.danger} />
          <Text style={styles.problemText}>{failure}</Text>
        </View>
      )}
      {errors.slice(0, 3).map((p, i) => (
        <View key={`e${i}`} style={styles.problem}>
          <AlertCircle size={14} color={colors.danger} />
          <Text style={styles.problemText}>{`Line ${p.line}: ${p.message}`}</Text>
        </View>
      ))}
      {errors.length > 3 && <Text style={styles.more}>{`…and ${errors.length - 3} more error${errors.length - 3 === 1 ? "" : "s"}`}</Text>}
      {errors.length > 0 && <Text style={styles.hint}>Fix the errors in the file, then import it again.</Text>}
      {later.size > 0 && errors.length === 0 && (
        <View style={styles.problem}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.problemText}>
            {`${later.size} thing${later.size === 1 ? "" : "s"} to fix after importing — e.g. points this robot does not have yet (they stay as names until taught). The builder's Problems list shows each one.`}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onClose} />
        <Button label="Import" onPress={doImport} disabled={!canImport} loading={saving} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  fileName: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4 },
  warnText: { fontSize: 12, color: colors.warning, marginTop: 4 },
  problem: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: spacing.sm },
  problemText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  more: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginLeft: 22 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.lg },
});
