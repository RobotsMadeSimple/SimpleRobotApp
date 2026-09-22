import React from "react";
import {
  Text,
  TouchableOpacity,
} from "react-native";
import { Camera, Check } from "lucide-react-native";
import { CameraState, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { TemplateInput } from "./NumericInputs";
import { ms } from "./builderStyles";
import { colors, accents } from "@/src/components/ui/kit";

// ── SaveImageFields ───────────────────────────────────────────────────────────

export function SaveImageFields({
  draft,
  variables,
  cameras,
  set,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  cameras: CameraState[];
  set: (p: Partial<ProgramStep>) => void;
}) {
  const accent = accents.cyan;

  return (
    <>
      <Text style={ms.hintText}>
        Save a camera snapshot to a file.{"\n"}
        Use <Text style={{ fontWeight: "700", color: colors.textSecondary }}>$variable</Text> in the path.{" "}
        <Text style={{ fontWeight: "700", color: accents.purple }}>$time_ms</Text> always holds the current Unix timestamp in ms — great for unique filenames.
      </Text>

      <Text style={[ms.fieldLabel, { marginTop: 14 }]}>CAMERA</Text>
      {cameras.length === 0 ? (
        <Text style={ms.emptyHint}>No cameras configured. Add cameras in the Camera settings.</Text>
      ) : (
        cameras.map((cam, i) => {
          const active = draft.saveImageCameraId === cam.id;
          return (
            <TouchableOpacity
              key={cam.id}
              style={[ms.row, i < cameras.length - 1 && ms.rowBorder, active && ms.rowActive]}
              onPress={() => set({ saveImageCameraId: cam.id })}
              activeOpacity={0.7}
            >
              <Camera size={14} color={active ? accent : colors.textMuted} />
              <Text style={[ms.rowLabel, { flex: 1 }, active && { color: accent }]}>{cam.name}</Text>
              {active && <Check size={14} color={accent} />}
            </TouchableOpacity>
          );
        })
      )}

      <Text style={[ms.fieldLabel, { marginTop: 14 }]}>SAVE PATH</Text>
      <TemplateInput
        value={draft.saveImagePath ?? ""}
        onChange={v => set({ saveImagePath: v })}
        placeholder="captures/$time_ms.jpg"
        style={ms.input}
        accent={accent}
        variables={variables}
        quickTokens={["$time_ms"]}
      />
      <Text style={[ms.hintText, { marginTop: 8 }]}>
        Relative paths are from the app directory. Folders are created automatically.
      </Text>
    </>
  );
}
