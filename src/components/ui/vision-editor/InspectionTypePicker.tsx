import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  Barcode,
  Check,
  Crosshair,
  Frame,
  Hexagon,
  Minus,
  Palette,
  QrCode,
  ScanLine,
  ScanSearch,
  Sparkles,
} from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import {
  BARCODE_FORMATS,
  ArucoInspection,
  BarcodeInspection,
  BlobInspection,
  ColorCoverageInspection,
  CornerInspection,
  EdgeInspection,
  FrameInspection,
  LineInspection,
  PolygonInspection,
  TextureInspection,
} from "@/src/models/robotModels";
import { colors, spacing } from "@/src/components/ui/kit";
import { ves } from "./visionEditorStyles";

// ── Discriminated union for all inspection kinds ──────────────────────────────

export type InspItem =
  | { kind: 'blob';    insp: BlobInspection }
  | { kind: 'color';   insp: ColorCoverageInspection }
  | { kind: 'polygon'; insp: PolygonInspection }
  | { kind: 'aruco';   insp: ArucoInspection }
  | { kind: 'line';    insp: LineInspection }
  | { kind: 'barcode'; insp: BarcodeInspection }
  | { kind: 'frame';   insp: FrameInspection }
  | { kind: 'corner';  insp: CornerInspection }
  | { kind: 'edge';    insp: EdgeInspection }
  | { kind: 'texture'; insp: TextureInspection };

export type InspKind = InspItem['kind'];

/** The frame / corner / edge / texture kinds share one edit path (the older kinds keep their inline styling). */
export type AlignKind = 'frame' | 'corner' | 'edge' | 'texture';
export const isAlignKind = (k: InspKind | null | undefined): k is AlignKind =>
  k === 'frame' || k === 'corner' || k === 'edge' || k === 'texture';

/** Identity of the frame / corner / edge / texture kinds. */
export const ALIGN_KIND_META: Record<AlignKind, { label: string; accent: string; soft: string }> = {
  frame:   { label: 'FRAME (ALIGNMENT)',  accent: '#0d9488', soft: '#ccfbf1' },
  corner:  { label: 'CORNER DETECTION',   accent: '#ea580c', soft: '#ffedd5' },
  edge:    { label: 'EDGE DETECTION',     accent: '#475569', soft: '#f1f5f9' },
  texture: { label: 'TEXTURE',            accent: '#9333ea', soft: '#f3e8ff' },
};

export function AlignKindIcon({ kind, size = 18, color }: { kind: AlignKind; size?: number; color?: string }) {
  const c = color ?? ALIGN_KIND_META[kind].accent;
  return kind === 'frame' ? <Frame size={size} color={c} /> : kind === 'corner' ? <Crosshair size={size} color={c} />
    : kind === 'texture' ? <Sparkles size={size} color={c} /> : <ScanLine size={size} color={c} />;
}

// ── Barcode format multi-select sheet ────────────────────────────────────────

export function FormatPickerSheet({ visible, selected, onToggle, onClose }: {
  visible: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Barcode Formats">
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>
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
              {active && <Check size={16} color={colors.accent} />}
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
  onSelect: (kind: InspKind) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Inspection">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
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
        <View style={[ves.typePickerIcon, { backgroundColor: '#fef3c7' }]}><Hexagon size={18} color={colors.warning} /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Polygon Detection</Text>
          <Text style={ves.sheetRowSub}>Find N-sided shapes and measure orientation</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={ves.sheetRow} onPress={() => { onSelect('aruco'); onClose(); }} activeOpacity={0.75}>
        <View style={[ves.typePickerIcon, { backgroundColor: colors.successSoft }]}><QrCode size={18} color={colors.success} /></View>
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
        <View style={[ves.typePickerIcon, { backgroundColor: colors.accentSoft }]}><Barcode size={18} color={colors.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={ves.sheetRowName}>Barcode / QR Code</Text>
          <Text style={ves.sheetRowSub}>Read QR codes, Code 128, EAN, Data Matrix and more</Text>
        </View>
      </TouchableOpacity>
      {([
        ['frame',  'Frame (alignment)', "Find a 4-cornered frame — e.g. the board's edge — and align zones to it each frame"],
        ['corner', 'Corner Detection',  'Find corner points (Shi-Tomasi or Harris) and count them'],
        ['edge',   'Edge Detection',    'Measure how much of a zone is edges (Canny) and its dominant direction'],
        ['texture', 'Texture',          'Fine detail per cell — tells a ringed or patterned object from a plain surface of the same colour, e.g. black checkers on black squares. Ignores glare and shadows.'],
      ] as const).map(([k, title, sub]) => (
        <TouchableOpacity key={k} style={ves.sheetRow} onPress={() => { onSelect(k); onClose(); }} activeOpacity={0.75}>
          <View style={[ves.typePickerIcon, { backgroundColor: ALIGN_KIND_META[k].soft }]}><AlignKindIcon kind={k} /></View>
          <View style={{ flex: 1 }}>
            <Text style={ves.sheetRowName}>{title}</Text>
            <Text style={ves.sheetRowSub}>{sub}</Text>
          </View>
        </TouchableOpacity>
      ))}
      </ScrollView>
    </BottomSheet>
  );
}
