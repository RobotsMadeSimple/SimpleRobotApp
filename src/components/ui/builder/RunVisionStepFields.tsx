import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, Plus } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { accents, colors, radii } from "@/src/components/ui/kit";
import {
  CameraState, ProgramStep, ProgramVariable,
  isAssignableVariable, isListVariable, isPointListVariable, isRecordListVariable,
} from "@/src/models/robotModels";
import { TOOL_META, outputChoices, type OutputChoice, type VisionProgram, type VisionToolOutput } from "@/src/models/visionTools";
import { ms } from "./builderStyles";
import { RunVisionOutputFrame } from "./RunVisionOutputFrame";
import { VarPickerModal, VarSelectorButton, type VarCreateSpec } from "./VarPicker";

type SetFields = (fields: Partial<ProgramStep>) => void;

/** Which variables a value kind may be written to, and what "+ New … variable" creates for it. */
function varRule(kind: OutputChoice["kind"] | undefined): { filter: (v: ProgramVariable) => boolean; create: VarCreateSpec } {
  switch (kind) {
    case "points": return { filter: isPointListVariable, create: { type: "list", elementType: "Point" } };
    case "cells":
    case "items":
    case "lines":
    case "pose":   return { filter: isRecordListVariable, create: { type: "list", elementType: "Record" } };
    case "string": return { filter: v => !!v.isString, create: { type: "string" } };
    case "bool":   return { filter: v => !isListVariable(v) && !v.isString, create: { type: "boolean" } };
    default:       return { filter: v => !isListVariable(v) && !v.isString, create: { type: "number" } };
  }
}

/**
 * RunVision step settings: the vision program, the output frame, an optional overall-pass variable
 * and a generic list of tool outputs (tool → value → variable). Rendered inside StepConfigModal's
 * body, so its pickers are modals of their own.
 */
export function RunVisionStepFields({
  draft, set, visionPrograms, cameras, variables, onSaveVariable, onOpenWizard,
}: {
  draft: ProgramStep;
  set: SetFields;
  visionPrograms: VisionProgram[];
  cameras: CameraState[];
  variables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
  onOpenWizard: (cameraId: string) => void;
}) {
  const [programPicker, setProgramPicker] = useState(false);
  const [passPicker, setPassPicker] = useState(false);
  const [rowPicker, setRowPicker] = useState<{ row: number; what: "tool" | "value" | "variable" } | null>(null);

  const vp = visionPrograms.find(p => p.id === draft.visionProgramId);
  const outputs: VisionToolOutput[] = draft.toolOutputs ?? [];
  const setOutputs = (next: VisionToolOutput[]) => set({ toolOutputs: next });
  const patchRow = (i: number, patch: Partial<VisionToolOutput>) => setOutputs(outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const pickRow = rowPicker ? outputs[rowPicker.row] : undefined;
  const pickTool = pickRow && vp ? vp.tools.find(t => t.id === pickRow.toolId) : undefined;
  const pickChoices = pickTool ? outputChoices(pickTool) : [];
  const pickKind = pickChoices.find(c => c.value === pickRow?.value)?.kind;
  const rule = varRule(pickKind);

  return (
    <>
      <Text style={ms.fieldLabel}>VISION PROGRAM</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4,
          borderWidth: 1, borderColor: vp ? accents.cyan : colors.border,
          borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 11 }}
        onPress={() => setProgramPicker(true)}
        activeOpacity={0.75}
      >
        {vp ? (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: accents.cyan }}>{vp.name}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
              {vp.cameraId || "No camera"} · {vp.tools.length} tool{vp.tools.length !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : (
          <Text style={{ flex: 1, fontSize: 14, color: colors.textFaint }}>
            {draft.visionProgramId ? `${draft.visionProgramName ?? "Missing program"} (not found)` : "Tap to select a vision program…"}
          </Text>
        )}
        <ChevronDown size={14} color={vp ? accents.cyan : colors.textFaint} />
      </TouchableOpacity>

      {vp && (
        <RunVisionOutputFrame
          value={draft.outputFrame}
          onChange={v => set({ outputFrame: v })}
          cameraId={vp.cameraId || undefined}
          camera={cameras.find(c => c.id === vp.cameraId)}
          onOpenWizard={onOpenWizard}
        />
      )}

      {vp && (
        <>
          <VarSelectorButton
            label="OVERALL PASS  (optional)"
            value={draft.passVariable}
            accent={colors.success}
            placeholder="None — tap to assign"
            onPress={() => setPassPicker(true)}
          />
          <Text style={ms.hintText}>1 when every tool set to count toward the pass passed, else 0.</Text>

          <Text style={[ms.fieldLabel, { marginTop: 16 }]}>TOOL OUTPUTS</Text>
          <Text style={ms.hintText}>
            Write any tool value to a variable when the step completes. Positions follow the output frame above.
          </Text>
          {outputs.map((o, i) => {
            const tool = vp.tools.find(t => t.id === o.toolId);
            const choice = tool ? outputChoices(tool).find(c => c.value === o.value) : undefined;
            return (
              <View key={i} style={{ marginTop: 10, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, padding: 10, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity style={rowBtn(!!tool)} onPress={() => setRowPicker({ row: i, what: "tool" })} activeOpacity={0.75}
                    accessibilityLabel="Output tool">
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: tool ? colors.text : colors.textFaint }} numberOfLines={1}>
                      {tool ? tool.name : o.toolId ? "Missing tool" : "Choose a tool…"}
                    </Text>
                    <ChevronDown size={13} color={colors.textFaint} />
                  </TouchableOpacity>
                  <DeleteIconButton size={14} onPress={() => setOutputs(outputs.filter((_, j) => j !== i))} />
                </View>
                {tool && (
                  <TouchableOpacity style={rowBtn(!!choice)} onPress={() => setRowPicker({ row: i, what: "value" })} activeOpacity={0.75}
                    accessibilityLabel="Output value">
                    <Text style={{ flex: 1, fontSize: 13, color: choice ? colors.text : colors.textFaint }} numberOfLines={1}>
                      {choice ? choice.label : o.value ? o.value : "Choose a value…"}
                    </Text>
                    <ChevronDown size={13} color={colors.textFaint} />
                  </TouchableOpacity>
                )}
                {tool && !!o.value && (
                  <VarSelectorButton
                    label="→ VARIABLE"
                    value={o.variable || undefined}
                    accent={choice && ["cells", "items", "points", "lines", "pose"].includes(choice.kind) ? accents.purple : colors.accent}
                    placeholder="None — tap to assign"
                    marginTop={false}
                    onPress={() => setRowPicker({ row: i, what: "variable" })}
                  />
                )}
                {choice?.kind === "pose" && <Text style={{ fontSize: 11, color: colors.textMuted }}>Read it as $name[0].x, .y, .angle.</Text>}
                {choice?.kind === "cells" && <Text style={{ fontSize: 11, color: colors.textMuted }}>Read a cell as $name[i].value, .passed, .row, .col or .index.</Text>}
              </View>
            );
          })}
          {vp.tools.length === 0 ? (
            <Text style={ms.emptyHint}>This vision program has no tools yet. Add some in the Vision editor.</Text>
          ) : (
            <TouchableOpacity style={[ms.modRowAdd, { marginTop: 10 }]} onPress={() => setOutputs([...outputs, { toolId: "", value: "", variable: "" }])} activeOpacity={0.7}
              accessibilityLabel="Add tool output">
              <Plus size={15} color={colors.textFaint} />
              <Text style={ms.modAddText}>Add output</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <BottomSheet visible={programPicker} onClose={() => setProgramPicker(false)} title="Select Vision Program">
        {visionPrograms.length === 0 && (
          <Text style={{ fontSize: 13, color: colors.textFaint, textAlign: "center", padding: 16 }}>No vision programs saved yet.</Text>
        )}
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
          {visionPrograms.map((p, i) => {
            const active = draft.visionProgramId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[ms.row, i < visionPrograms.length - 1 && ms.rowBorder, active && ms.rowActive]}
                onPress={() => {
                  // Outputs name the old program's tools, so a different program starts clean.
                  set(active ? {} : { visionProgramId: p.id, visionProgramName: p.name, toolOutputs: [] });
                  setProgramPicker(false);
                }}
                activeOpacity={0.7}
              >
                <View style={[ms.radioRing, active && ms.radioRingActive]}>{active && <View style={ms.radioDot} />}</View>
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{p.name}</Text>
                  {!!p.description && <Text style={ms.rowDesc}>{p.description}</Text>}
                  <Text style={ms.rowDesc}>{p.cameraId || "No camera"} · {p.tools.length} tool{p.tools.length !== 1 ? "s" : ""}</Text>
                </View>
                {active && <Check size={16} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={rowPicker?.what === "tool"} onClose={() => setRowPicker(null)} title="Tool">
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
          {(vp?.tools ?? []).map((t, i, arr) => {
            const active = pickRow?.toolId === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                onPress={() => {
                  if (rowPicker && !active) patchRow(rowPicker.row, { toolId: t.id, value: "", variable: "" });
                  setRowPicker(rowPicker && !active ? { row: rowPicker.row, what: "value" } : null);
                }}
                activeOpacity={0.7}
              >
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{t.name}</Text>
                  <Text style={ms.rowDesc}>{TOOL_META[t.type]?.label ?? t.type}{t.enabled ? "" : " · disabled"}</Text>
                </View>
                {active && <Check size={16} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={rowPicker?.what === "value"} onClose={() => setRowPicker(null)} title={pickTool ? `${pickTool.name} — value` : "Value"}>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
          {pickChoices.map((c, i) => {
            const active = pickRow?.value === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[ms.row, i < pickChoices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                onPress={() => {
                  if (rowPicker) {
                    // A value of another shape needs another kind of variable.
                    const keep = pickRow?.variable && varRule(c.kind).filter((variables ?? []).find(v => v.name === pickRow.variable) ?? ({} as ProgramVariable));
                    patchRow(rowPicker.row, { value: c.value, variable: keep ? pickRow!.variable : "" });
                  }
                  setRowPicker(rowPicker ? { row: rowPicker.row, what: "variable" } : null);
                }}
                activeOpacity={0.7}
              >
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{c.label}</Text>
                  <Text style={ms.rowDesc}>{c.value}</Text>
                </View>
                {active && <Check size={16} color={colors.accent} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <VarPickerModal
        filter={isAssignableVariable}
        visible={rowPicker?.what === "variable"}
        onClose={() => setRowPicker(null)}
        variables={(variables ?? []).filter(rule.filter)}
        selected={pickRow?.variable || undefined}
        title={pickChoices.find(c => c.value === pickRow?.value)?.label ?? "Variable"}
        showNone
        create={rule.create}
        onCreateVariable={onSaveVariable}
        allVariables={variables}
        onSelect={v => { if (rowPicker) patchRow(rowPicker.row, { variable: v?.name ?? "" }); }}
      />
      <VarPickerModal
        filter={isAssignableVariable}
        visible={passPicker}
        onClose={() => setPassPicker(false)}
        variables={(variables ?? []).filter(v => !isListVariable(v) && !v.isString)}
        selected={draft.passVariable}
        title="Overall Pass Variable"
        showNone
        create={{ type: "boolean" }}
        onCreateVariable={onSaveVariable}
        allVariables={variables}
        onSelect={v => set({ passVariable: v?.name })}
      />
    </>
  );
}

const rowBtn = (set: boolean) => ({
  flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
  borderWidth: 1, borderColor: set ? accents.cyan : colors.border, borderRadius: radii.sm,
  backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 9,
});
