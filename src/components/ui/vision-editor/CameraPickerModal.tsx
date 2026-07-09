import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { CameraState } from "@/src/models/robotModels";
import { ves } from "./visionEditorStyles";

export function CameraPickerModal({ visible, cameras, selected, onSelect, onClose }: {
  visible: boolean;
  cameras: CameraState[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Camera">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {cameras.length === 0 && (
          <Text style={ves.sheetEmpty}>No cameras found</Text>
        )}
        {cameras.map(cam => (
          <TouchableOpacity
            key={cam.id}
            style={[ves.sheetRow, cam.id === selected && ves.sheetRowActive]}
            onPress={() => { onSelect(cam.id); onClose(); }}
          >
            <View style={[ves.dot, { backgroundColor: cam.connected ? "#22c55e" : "#d1d5db" }]} />
            <View style={{ flex: 1 }}>
              <Text style={ves.sheetRowName}>{cam.name || cam.id}</Text>
              {cam.name && <Text style={ves.sheetRowSub}>{cam.id}</Text>}
            </View>
            {cam.id === selected && <Check size={16} color="#0891b2" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
