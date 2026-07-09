import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  Barcode,
  Check,
  Hexagon,
  Minus,
  Palette,
  QrCode,
  ScanSearch,
} from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import {
  BARCODE_FORMATS,
  ArucoInspection,
  BarcodeInspection,
  BlobInspection,
  ColorCoverageInspection,
  LineInspection,
  PolygonInspection,
} from "@/src/models/robotModels";
import { ves } from "./visionEditorStyles";

// ── Discriminated union for all inspection kinds ──────────────────────────────

export type InspItem =
  | { kind: 'blob';    insp: BlobInspection }
  | { kind: 'color';   insp: ColorCoverageInspection }
  | { kind: 'polygon'; insp: PolygonInspection }
  | { kind: 'aruco';   insp: ArucoInspection }
  | { kind: 'line';    insp: LineInspection }
  | { kind: 'barcode'; insp: BarcodeInspection };

// ── Barcode format multi-select sheet ────────────────────────────────────────

export function FormatPickerSheet({ visible, selected, onToggle, onClose }: {
  visible: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Barcode Formats">
      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
        Leave all unchecked to scan every supported format
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {BARCODE_FORMATS.map(f => {
          const active = selected.includes(f.id);
          return (
            <TouchableOpacity
              key={f.id}
              style={[ves.sheetRow, active && ves.sheetRowActive]}
              onPress={() => onToggle(f.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={ves.sheetRowName}>{f.label}</Text>
              </View>
              {active && <Check size={16} color="#2563eb" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Inspection type picker bottom sheet ───────────────────────────────────────

export function InspectionTypePicker({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (kind: 'blob' | 'color' | 'polygon' | 'aruco' | 'line' | 'barcode') => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Inspection">
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('blob'); onClose(); }} activeOpacity={0.75}>
        <View style={ves.typePickerIcon}><ScanSearch size={18} color="#0891b2" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Blob Detection</Text>
          <Text style={ves.sheetRowSub}>Detect and count objects by shape</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('color'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: '#fdf4ff' }]}><Palette size={18} color="#d946ef" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Color Coverage</Text>
          <Text style={ves.sheetRowSub}>Measure pixel color percentage in a zone</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('polygon'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: '#fef3c7' }]}><Hexagon size={18} color="#d97706" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Polygon Detection</Text>
          <Text style={ves.sheetRowSub}>Find N-sided shapes and measure orientation</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('aruco'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: '#f0fdf4' }]}><QrCode size={18} color="#16a34a" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>ArUco Marker</Text>
          <Text style={ves.sheetRowSub}>Detect ArUco fiducial markers and read their IDs</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('line'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: '#f5f3ff' }]}><Minus size={18} color="#7c3aed" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Line Detection</Text>
          <Text style={ves.sheetRowSub}>Detect straight lines using Canny edges and Hough transform</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('barcode'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: '#eff6ff' }]}><Barcode size={18} color="#2563eb" /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Barcode / QR Code</Text>
          <Text style={ves.sheetRowSub}>Read QR codes, Code 128, EAN, Data Matrix and more</Text>
        </View>
      </TouchableOpacity>
    </BottomSheet>
  );
}
