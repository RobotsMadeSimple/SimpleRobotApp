import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check, RefreshCw } from "lucide-react-native";
import { ProgramStep } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { colors } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";

/**
 * Editor for a GcodeProgram step: run a stored G-code file (picked from the controller) or
 * paste inline G-code. Mirrors the two-source idea of other file-backed steps. Validation calls
 * the controller's ValidateGcodeFile so the user sees line/move counts or the first parse error.
 */
export function GcodeProgramFields({
  draft, set,
}: {
  draft: ProgramStep;
  set: (fields: Partial<ProgramStep>) => void;
}) {
  const inline = draft.gcodeFile == null && draft.gcodeText != null;
  const [mode, setMode] = useState<"file" | "inline">(inline ? "inline" : "file");
  const [files, setFiles] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; lines?: number; moves?: number; error?: string } | null>(null);

  const loadFiles = () => {
    setLoading(true);
    robotClient.listGcodeFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (mode === "file") loadFiles(); }, [mode]);

  const validate = () => {
    if (!draft.gcodeFile) return;
    setCheck(null);
    robotClient.validateGcodeFile(draft.gcodeFile)
      .then(setCheck)
      .catch(e => setCheck({ ok: false, error: String(e) }));
  };

  return (
    <>
      <Text style={ms.fieldLabel}>SOURCE</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        {(["file", "inline"] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[ms.seg, { flex: 1, height: 40, justifyContent: "center" }, mode === m && ms.segActive]}
            onPress={() => {
              setMode(m);
              // Keep exactly one source populated.
              if (m === "file") set({ gcodeText: undefined });
              else set({ gcodeFile: undefined, gcodeText: draft.gcodeText ?? "" });
            }}
            activeOpacity={0.8}
          >
            <Text style={ms.segText}>{m === "file" ? "Stored file" : "Inline"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "file" ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            <Text style={ms.fieldLabel}>G-CODE FILE</Text>
            <TouchableOpacity onPress={loadFiles} hitSlop={10} activeOpacity={0.7}>
              <RefreshCw size={15} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {loading && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 10 }} />}
          {files && files.length === 0 && (
            <Text style={ms.hintText}>No G-code files on the controller. Upload one from the G-code Files screen.</Text>
          )}
          {files && files.map(f => {
            const selected = draft.gcodeFile === f;
            return (
              <TouchableOpacity
                key={f}
                style={[ms.seg, { marginTop: 8, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, selected && ms.segActive]}
                onPress={() => { set({ gcodeFile: f, gcodeText: undefined }); setCheck(null); }}
                activeOpacity={0.8}
              >
                <Text style={[ms.segText, { fontSize: 14 }]} numberOfLines={1}>{f}</Text>
                {selected && <Check size={16} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
          {draft.gcodeFile && (
            <>
              <TouchableOpacity
                style={[ms.seg, { marginTop: 12, height: 40, justifyContent: "center" }]}
                onPress={validate}
                activeOpacity={0.8}
              >
                <Text style={ms.segText}>Validate</Text>
              </TouchableOpacity>
              {check && (
                <Text style={[ms.hintText, { color: check.ok ? colors.success : colors.danger }]}>
                  {check.ok
                    ? `Valid · ${check.lines ?? 0} lines · ${check.moves ?? 0} moves`
                    : `Error: ${check.error}`}
                </Text>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 14 }]}>G-CODE</Text>
          <TextInput
            style={[ms.input, { height: 160, textAlignVertical: "top", fontFamily: "monospace" }]}
            value={draft.gcodeText ?? ""}
            onChangeText={t => set({ gcodeText: t, gcodeFile: undefined })}
            placeholder={"G21 G90\nG0 X0 Y0 Z5\nG1 Z-1 F300\nG1 X10 Y0"}
            placeholderTextColor={colors.textFaint}
            multiline
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </>
      )}

      <Text style={ms.hintText}>
        Common codes run: G0-G3 moves, G4 dwell, G20/G21 units, G90/G91, G92, G28, M3/M4/M5 spindle,
        M0/M2/M30. Rapid speed, feed, arc tolerance and the spindle output are set on Robot › Configure.
      </Text>
    </>
  );
}
