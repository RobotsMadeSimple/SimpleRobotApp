import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import JogPad from "@/src/components/ui/JogPad";
import {
  Button,
  buttonTextColor,
  Card,
  Chip,
  ChipGroup,
  colors,
  Divider,
  FormRow,
  Input,
  RadioRow,
  radii,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useLocals, usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, Tabs, useFocusEffect } from "expo-router";
import {
  ArrowRight,
  ChevronDown,
  Grid2X2,
  MousePointerClick,
  OctagonX,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Picker modal ──────────────────────────────────────────────────────────────
function PickerModal({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  viewLabel,
  viewRoute,
}: {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  viewLabel?: string;
  viewRoute?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={styles.pickerCard} onPress={() => {}} activeOpacity={1}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {options.map((opt, i) => {
              const active = opt === value;
              const isLast = i === options.length - 1;
              return (
                <View key={opt}>
                  <RadioRow
                    title={opt}
                    selected={active}
                    onPress={() => { onSelect(opt); onClose(); }}
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </ScrollView>

          {viewLabel && viewRoute && (
            <TouchableOpacity
              style={styles.pickerViewLink}
              onPress={() => { onClose(); router.push(viewRoute as any); }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerViewLinkText}>{viewLabel}</Text>
              <ArrowRight size={14} color={colors.accent} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Selector ──────────────────────────────────────────────────────────────────
function Selector({
  label,
  value,
  options,
  onSelect,
  icon,
  viewLabel,
  viewRoute,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  icon?: React.ReactNode;
  viewLabel?: string;
  viewRoute?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.selectorWrap}>
      <AnimatedPressable style={styles.selectorBtn} onPress={() => setOpen(true)}>
        {icon && <View style={styles.selectorIcon}>{icon}</View>}
        <View style={styles.selectorTextStack}>
          <Text style={styles.selectorLabel}>{label}</Text>
          <View style={styles.selectorValueRow}>
            <Text style={styles.selectorValue}>{value}</Text>
            <ChevronDown size={13} color={colors.textFaint} />
          </View>
        </View>
      </AnimatedPressable>

      <PickerModal
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
        viewLabel={viewLabel}
        viewRoute={viewRoute}
      />
    </View>
  );
}

// ── Teach modal ───────────────────────────────────────────────────────────────
function TeachModal({ onClose }: { onClose: () => void }) {
  const points = usePoints();
  const [mode, setMode] = useState<"list" | "new">("list");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const filtered = points.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function teachPoint(name: string) {
    robotClient.sendCommand("TeachPoint", { name });
    onClose();
  }

  function teachNew() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    robotClient.sendCommand("TeachPoint", { name: trimmed });
    onClose();
  }

  return (
    <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
      <TouchableOpacity style={styles.dialog} onPress={() => {}} activeOpacity={1}>
        <View style={styles.dialogHeader}>
          <Text style={styles.dialogTitle}>
            {mode === "list" ? "Teach Point" : "New Point"}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
            <X size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>

        {mode === "list" ? (
          <>
            <View style={styles.searchRow}>
              <Search size={15} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search points…"
                placeholderTextColor={colors.textFaint}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.pointList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 && (
                <Text style={styles.emptyText}>
                  {points.length === 0 ? "No points saved yet" : "No matches"}
                </Text>
              )}
              {filtered.map((p, i) => (
                <View key={p.name}>
                  <TouchableOpacity style={styles.pointRow} onPress={() => teachPoint(p.name)} activeOpacity={0.7}>
                    <Text style={styles.pointName}>{p.name}</Text>
                    <Text style={styles.pointCoords}>
                      {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                    </Text>
                  </TouchableOpacity>
                  {i < filtered.length - 1 && <Divider />}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.newPointButton} onPress={() => setMode("new")} activeOpacity={0.7}>
              <Plus size={16} color={colors.accent} />
              <Text style={styles.newPointText}>New Point</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <FormRow label="Point name" style={styles.newPointForm}>
              <Input
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. PickUp1"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={teachNew}
              />
            </FormRow>
            <View style={styles.modalActions}>
              <Button label="Back" variant="secondary" style={styles.modalCancelFlex} onPress={() => setMode("list")} />
              <Button
                label="Teach Here"
                variant="primary"
                icon={<MousePointerClick size={15} color={buttonTextColor("primary")} />}
                disabled={!newName.trim()}
                style={styles.modalConfirmFlex}
                onPress={teachNew}
              />
            </View>
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function JogScreen() {
  const [selectedSpeed, setSelectedSpeed] = useState("Slow");
  const [mode, setMode]                 = useState("XYZ");
  const [teachOpen, setTeachOpen]       = useState(false);
  const [jogSpeeds, setJogSpeeds]       = useState<{ Slow: number; Normal: number; Fast: number } | undefined>(undefined);

  const tools      = useTools();
  const locals     = useLocals();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;
  const wideContent = useWideContent();
  // Two columns on tablets, foldables and desktop (the split breakpoint and up).
  const twoColumn = useIsWide();

  const [tool, setToolLocal] = useState(activeTool || "None");

  function setTool(name: string) {
    setToolLocal(name);
    robotClient.setActiveTool(name);
  }

  const local = status.activeLocal || "None";
  const localOptions = ["None", ...locals.map(l => l.name)];

  function setLocal(name: string) {
    robotClient.setActiveLocal(name === "None" ? "" : name);
  }

  const s = status;

  const fmt          = (v?: number) => (v ?? 0).toFixed(1);
  const speedOptions = ["0.1mm", "1mm", "10mm", "Slow", "Normal", "Fast"];

  const jogModes = [
    { label: "XYZ",   value: "XYZ" },
    { label: "Tool",  value: "Tool" },
    { label: "Joint", value: "Joint" },
  ];

  // Reload jog speeds whenever this screen comes into focus (picks up config changes immediately)
  useFocusEffect(useCallback(() => {
    robotClient.getRobotConfig()
      .then(cfg => setJogSpeeds({ Slow: cfg.jogSlowSpeed, Normal: cfg.jogNormalSpeed, Fast: cfg.jogFastSpeed }))
      .catch(() => {});
  }, []));

  // Keep local selector in sync when active tool changes externally
  useEffect(() => {
    setToolLocal(activeTool || "None");
  }, [activeTool]);

  const coords = mode === "Joint"
    ? [
        { label: "J1", value: s?.joint1Angle, unit: "°" },
        { label: "J2", value: s?.joint2X,     unit: "mm" },
        { label: "J3", value: s?.joint2Z,     unit: "mm" },
        { label: "J4", value: s?.joint4Angle, unit: "°" },
      ]
    : [
        // Local-frame position — tracks the selected local (equals world when none)
        { label: "X",  value: s?.localX,  unit: "mm" },
        { label: "Y",  value: s?.localY,  unit: "mm" },
        { label: "Z",  value: s?.localZ,  unit: "mm" },
        { label: "RZ", value: s?.localRZ, unit: "°"  },
      ];

  // The three pieces the layout arranges. Defined once so the single-column and
  // two-column layouts place the same controls without duplicating them.
  const configCard = (
    <Card>

      {/* Position strip */}
      <View style={styles.coordRow}>
        {coords.map(({ label, value, unit }) => (
          <View key={label} style={styles.coordCell}>
            <Text style={styles.coordLabel}>{label}</Text>
            <Text style={styles.coordValue}>{fmt(value)}</Text>
            <Text style={styles.coordUnit}>{unit}</Text>
          </View>
        ))}
      </View>

      <Divider style={styles.cardSeparator} />

      {/* Local / Tool row */}
      <View style={styles.selectorsRow}>
        <Selector
          label="LOCAL"
          value={local}
          options={localOptions}
          onSelect={setLocal}
          icon={<Grid2X2 size={15} color={colors.textMuted} />}
          viewLabel="View Locals"
          viewRoute="/space/locals"
        />
        <Divider vertical style={styles.cardDivider} />
        <Selector
          label="TOOL"
          value={tool || "None"}
          options={["None", ...tools.map(t => t.name)]}
          onSelect={setTool}
          icon={<Wrench size={15} color={colors.textMuted} />}
          viewLabel="View Tools"
          viewRoute="/space/tools"
        />
      </View>

      <Divider style={styles.cardSeparator} />

      {/* Jog mode */}
      <SegmentedControl options={jogModes} value={mode} onChange={setMode} />

      <Divider style={styles.cardSeparator} />

      {/* Speed */}
      <ChipGroup>
        {speedOptions.map((spd) => (
          <Chip
            key={spd}
            label={spd}
            selected={selectedSpeed === spd}
            onPress={() => setSelectedSpeed(spd)}
          />
        ))}
      </ChipGroup>

    </Card>
  );

  const jogPad = (
    <View style={styles.jogWrapper}>
      <JogPad jogMode={mode} selectedSpeed={selectedSpeed} speedOverrides={jogSpeeds} />
    </View>
  );

  const stopTeach = (
    <View style={styles.bottomRow}>
      <Button
        label="STOP"
        variant="destructive"
        icon={<OctagonX size={22} color={buttonTextColor("destructive")} />}
        style={styles.stopButton}
        textStyle={styles.stopText}
        onPress={() => robotClient.sendCommand("HardStop")}
      />

      <Button
        label="Teach"
        variant="ghost"
        icon={<MousePointerClick size={18} color={colors.accent} />}
        style={styles.teachButton}
        textStyle={styles.teachButtonText}
        onPress={() => setTeachOpen(true)}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <SubPageHeader title="Jog & Teach" />

      {twoColumn ? (
        // Wide: jog config + STOP/Teach on the left, the jog buttons filling the right.
        <View style={styles.wideRow}>
          <View style={styles.wideLeftCol}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.wideColContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {configCard}
            </ScrollView>
            {stopTeach}
          </View>

          <View style={styles.wideJogCol}>
            {jogPad}
          </View>
        </View>
      ) : (
        // Narrow: everything stacked, STOP/Teach pinned to the bottom.
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, wideContent]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {configCard}
            {jogPad}
          </ScrollView>
          {stopTeach}
        </>
      )}

      {/* ── Teach modal ── */}
      <Modal
        visible={teachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTeachOpen(false)}
      >
        <TeachModal key={teachOpen ? "open" : "closed"} onClose={() => setTeachOpen(false)} />
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: spacing.sm + 2,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },

  // ── Wide (tablet+) two-column layout ────────────────────────────────────────
  // The whole pair is centred, so on a wide desktop the empty space reads as even
  // margins around the two columns rather than as a moat around the jog pad.
  wideRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  // Left column: the config card (scrolls if tall) with STOP/Teach pinned to its foot.
  // Flexes so it gives way on a narrow tablet, capped so it doesn't sprawl on desktop.
  wideLeftCol: {
    flex: 1,
    maxWidth: 440,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  wideColContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  // Right column: hugs the jog pad (a fixed ~405px, sized off the window) rather than
  // flexing to fill, so the pad isn't left swimming in space on a wide screen.
  wideJogCol: {
    width: 430,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  cardSeparator: {
    marginVertical: spacing.sm,
  },

  selectorsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardDivider: {
    marginHorizontal: spacing.xs,
  },

  // ── Position ──────────────────────────────────────────────────────────────
  coordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  coordCell: {
    alignItems: "center",
    flex: 1,
  },

  coordLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  coordValue: {
    ...type.mono,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  coordUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // ── Selector ──────────────────────────────────────────────────────────────
  selectorWrap: {
    flex: 1,
    position: "relative",
  },

  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },

  selectorIcon: {
    opacity: 0.7,
  },

  selectorTextStack: {
    alignItems: "flex-start",
    gap: 2,
  },

  selectorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.8,
  },

  selectorValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  selectorValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },

  // ── Picker modal ──────────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },

  pickerCard: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  pickerViewLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  pickerViewLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },

  // ── JogPad ────────────────────────────────────────────────────────────────
  jogWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs + 2,
  },

  // ── Bottom row (fixed) ────────────────────────────────────────────────────
  bottomRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md + 2,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // STOP keeps its exact hit area (paddingVertical) — only color/radius come from the kit.
  stopButton: {
    flex: 3,
    paddingVertical: spacing.md,
  },

  stopText: {
    fontSize: 18,
    letterSpacing: 2,
  },

  teachButton: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
  },

  teachButtonText: {
    fontSize: 15,
  },

  // ── Teach modal ───────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: 300,
    maxHeight: 600,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md + 2,
  },

  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 1,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },

  pointList: {
    maxHeight: 200,
  },

  pointRow: {
    paddingVertical: spacing.sm + 3,
  },

  pointName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },

  pointCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },

  emptyText: {
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.lg + 4,
    fontSize: 14,
  },

  newPointButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md + 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },

  newPointText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: "600",
  },

  newPointForm: {
    marginBottom: spacing.md + 2,
  },

  modalActions: {
    flexDirection: "row",
    gap: spacing.sm + 2,
  },

  modalCancelFlex: {
    flex: 1,
  },

  modalConfirmFlex: {
    flex: 2,
  },
});
