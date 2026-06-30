import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { ARUCO_DICTIONARIES } from "@/src/models/robotModels";
import { ves } from "./visionEditorStyles";

export function DictionaryPickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean;
  selected: number;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="ArUco Dictionary">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {ARUCO_DICTIONARIES.map(d => (
          <TouchableOpacity
            key={d.id}
            style={[ves.sheetRow, d.id === selected && ves.sheetRowActive]}
            onPress={() => { onSelect(d.id); onClose(); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={ves.sheetRowName}>{d.label}</Text>
            </View>
            {d.id === selected && <Check size={16} color="#0891b2" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
