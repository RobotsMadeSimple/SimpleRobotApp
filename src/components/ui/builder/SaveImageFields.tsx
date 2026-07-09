import React, { useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Camera, Check } from "lucide-react-native";
import { CameraState, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { VarPickerModal } from "./VarPicker";
import { ms } from "./builderStyles";

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
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const accent = "#0891b2";

  function insertPathToken(token: string) {
    const cur = draft.saveImagePath ?? "";
    set({ saveImagePath: cur ? `${cur}${token}` : token });
  }

  return (
    <>
      <Text style={ms.hintText}>
        Save a camera snapshot to a file.{"\n"}
        Use <Text style={{ fontWeight: "700", color: "#374151" }}>$variable</Text> in the path.{" "}
        <Text style={{ fontWeight: "700", color: "#7c3aed" }}>$time_ms</Text> always holds the current Unix timestamp in ms — great for unique filenames.
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
              <Camera size={14} color={active ? accent : "#6b7280"} />
              <Text style={[ms.rowLabel, { flex: 1 }, active && { color: accent }]}>{cam.name}</Text>
              {active && <Check size={14} color={accent} />}
            </TouchableOpacity>
          );
        })
      )}

      <Text style={[ms.fieldLabel, { marginTop: 14 }]}>SAVE PATH</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <TextInput
          value={draft.saveImagePath ?? ""}
          onChangeText={v => set({ saveImagePath: v })}
          placeholder="captures/$time_ms.jpg"
          placeholderTextColor="#9ca3af"
          style={[ms.input, { flex: 1, color: "#0891b2" }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {(variables ?? []).length > 0 && (
          <TouchableOpacity
            style={{ backgroundColor: "#e0f2fe", borderWidth: 1, borderColor: "#7dd3fc", borderRadius: 9, paddingHorizontal: 10, justifyContent: "center", marginTop: 6 }}
            onPress={() => setVarPickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0891b2" }}>$var</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Text style={{ fontSize: 11, color: "#9ca3af" }}>Quick insert:</Text>
        <TouchableOpacity
          style={{ backgroundColor: "#ede9fe", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#c4b5fd" }}
          onPress={() => insertPathToken("$time_ms")}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 12, color: "#7c3aed", fontWeight: "600" }}>$time_ms</Text>
        </TouchableOpacity>
      </View>
      <Text style={[ms.hintText, { marginTop: 4 }]}>
        Relative paths are from the app directory. Folders are created automatically.
      </Text>

      <VarPickerModal
        visible={varPickerOpen}
        onClose={() => setVarPickerOpen(false)}
        variables={variables ?? []}
        selected={undefined}
        title="Insert Variable"
        onSelect={v => {
          if (v) insertPathToken(`$${v.name}`);
          setVarPickerOpen(false);
        }}
      />
    </>
  );
}
