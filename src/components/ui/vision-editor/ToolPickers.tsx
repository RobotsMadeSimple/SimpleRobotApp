import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  Anchor, Barcode, Check, Circle, CornerDownRight, Crosshair, Hexagon, Image as ImageIcon, Minus,
  MoveHorizontal, Palette, QrCode, Ruler, ScanLine, ScanSearch, Shapes, Spline, Sun, TriangleRight,
} from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { accents, colors, spacing } from "@/src/components/ui/kit";
import {
  BARCODE_FORMAT_OPTIONS, FILTER_META, FILTER_TYPES, TOOL_CATEGORIES, TOOL_META, TOOL_TYPES,
  type FilterType, type ToolCategory, type VisionToolType,
} from "@/src/models/visionTools";
import { ves } from "./visionEditorStyles";

type IconC = React.ComponentType<{ size?: number; color?: string }>;

const TOOL_ICONS: Record<VisionToolType, IconC> = {
  findLine: Minus, findCorner: CornerDownRight, findCircle: Circle, blob: ScanSearch, contourMatch: Shapes,
  patternMatch: ImageIcon, aruco: QrCode, makeFixture: Anchor,
  caliper: MoveHorizontal, distance: Ruler, angle: TriangleRight, corners: Crosshair, lines: Spline,
  pixelCount: Palette, intensity: Sun, edgePixels: ScanLine, polygon: Hexagon,
  barcode: Barcode,
};

/** Accent / soft fill per tool category. */
export const CATEGORY_TINT: Record<ToolCategory, { fg: string; bg: string }> = {
  locate:   { fg: accents.cyan,   bg: accents.cyanSoft },
  measure:  { fg: accents.purple, bg: accents.purpleSoft },
  presence: { fg: colors.success, bg: colors.successSoft },
  read:     { fg: colors.accent,  bg: colors.accentSoft },
};

export function ToolIcon({ type, size = 18, color }: { type: VisionToolType; size?: number; color?: string }) {
  const Icon = TOOL_ICONS[type] ?? ScanSearch;
  return <Icon size={size} color={color ?? CATEGORY_TINT[TOOL_META[type]?.category ?? "locate"].fg} />;
}

export function ToolTile({ type, size = 36 }: { type: VisionToolType; size?: number }) {
  const tint = CATEGORY_TINT[TOOL_META[type]?.category ?? "locate"];
  return (
    <View style={[ves.typePickerIcon, { width: size, height: size, backgroundColor: tint.bg }]}>
      <ToolIcon type={type} size={Math.round(size / 2)} />
    </View>
  );
}

/** "Add tool" sheet: the catalogue grouped Locate / Measure / Presence & count / Read. */
export function ToolTypePicker({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (type: VisionToolType) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Tool">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingBottom: spacing.sm }}>
        {TOOL_CATEGORIES.map(cat => (
          <View key={cat.id} style={{ gap: 2 }}>
            <Text style={[ves.sectionLabel, { marginTop: spacing.sm, color: CATEGORY_TINT[cat.id].fg }]}>{cat.label.toUpperCase()}</Text>
            <Text style={[ves.sheetRowSub, { marginBottom: 2 }]}>{cat.description}</Text>
            {TOOL_TYPES.filter(t => TOOL_META[t].category === cat.id).map(t => (
              <TouchableOpacity
                key={t}
                style={ves.sheetRow}
                onPress={() => { onClose(); onSelect(t); }}
                activeOpacity={0.75}
                accessibilityLabel={`Add ${TOOL_META[t].label}`}
              >
                <ToolTile type={t} />
                <View style={{ flex: 1 }}>
                  <Text style={ves.sheetRowName}>{TOOL_META[t].label}</Text>
                  <Text style={ves.sheetRowSub}>{TOOL_META[t].description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** "Add filter" sheet. */
export function FilterTypePicker({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (type: FilterType) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Filter">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {FILTER_TYPES.map(t => (
          <TouchableOpacity key={t} style={ves.sheetRow} onPress={() => { onClose(); onSelect(t); }} activeOpacity={0.75}>
            <View style={{ flex: 1 }}>
              <Text style={ves.sheetRowName}>{FILTER_META[t].label}</Text>
              <Text style={ves.sheetRowSub}>{FILTER_META[t].description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** Barcode format multi-select. Empty = every format. */
export function FormatPickerSheet({ visible, selected, onToggle, onClose }: {
  visible: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Barcode Formats">
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>
        Leave all unchecked to read every supported format
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {BARCODE_FORMAT_OPTIONS.map(f => {
          const active = selected.includes(f.id);
          return (
            <TouchableOpacity key={f.id} style={[ves.sheetRow, active && ves.sheetRowActive]} onPress={() => onToggle(f.id)}>
              <View style={{ flex: 1 }}><Text style={ves.sheetRowName}>{f.label}</Text></View>
              {active && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** Generic single-choice sheet of { id, title, subtitle } rows, with an optional "none" row. */
export function ChoiceSheet({ visible, title, hint, rows, selected, noneLabel, onSelect, onClose }: {
  visible: boolean;
  title: string;
  hint?: string;
  rows: { id: string; title: string; subtitle?: string; disabled?: boolean }[];
  selected: string | null;
  noneLabel?: string;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const all = noneLabel ? [{ id: "", title: noneLabel }, ...rows] : rows;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {!!hint && <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>{hint}</Text>}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
        {all.length === 0 && <Text style={ves.sheetEmpty}>Nothing to choose yet</Text>}
        {all.map(r => {
          const active = (selected ?? "") === r.id;
          const disabled = "disabled" in r && !!r.disabled;
          return (
            <TouchableOpacity
              key={r.id || "none"}
              style={[ves.sheetRow, active && ves.sheetRowActive, disabled && { opacity: 0.4 }]}
              disabled={disabled}
              onPress={() => { onSelect(r.id || null); onClose(); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={ves.sheetRowName}>{r.title}</Text>
                {"subtitle" in r && !!r.subtitle && <Text style={ves.sheetRowSub}>{r.subtitle}</Text>}
              </View>
              {active && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
