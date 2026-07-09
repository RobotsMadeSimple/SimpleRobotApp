import React from "react";
import { ScrollView, Text, TouchableOpacity } from "react-native";
import { Check } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { VisionZone } from "@/src/models/robotModels";
import { ves } from "./visionEditorStyles";

export function ZonePickerModal({ visible, zones, selected, onSelect, onClose }: {
  visible: boolean;
  zones: VisionZone[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Zone">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        <TouchableOpacity
          style={[ves.sheetRow, !selected && ves.sheetRowActive]}
          onPress={() => { onSelect(null); onClose(); }}
        >
          <Text style={ves.sheetRowName}>Full image</Text>
          {!selected && <Check size={16} color="#0891b2" />}
        </TouchableOpacity>
        {zones.map(z => (
          <TouchableOpacity
            key={z.id}
            style={[ves.sheetRow, z.id === selected && ves.sheetRowActive]}
            onPress={() => { onSelect(z.id); onClose(); }}
          >
            <Text style={ves.sheetRowName}>{z.name}</Text>
            {z.id === selected && <Check size={16} color="#0891b2" />}
          </TouchableOpacity>
        ))}
        {zones.length === 0 && <Text style={ves.sheetEmpty}>No zones defined</Text>}
      </ScrollView>
    </BottomSheet>
  );
}
