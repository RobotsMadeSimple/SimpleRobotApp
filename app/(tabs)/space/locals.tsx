import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import {
  accents,
  Button,
  Card,
  colors,
  Divider,
  EmptyState,
  InfoTip,
  PageHeader,
  radii,
  RadioRow,
  Screen,
  SectionHeader,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { Local } from "@/src/models/robotModels";
import { useLocals, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { usePushOnce } from "@/src/hooks/usePushOnce";
import { Edit2, Grid3x3, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Space3DToggle, SpaceList3DLayout, useRememberedFlag } from "@/src/components/space/space3d";
import type { Cell3DOptions, Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import { useCallback, useMemo } from "react";

// The optional 3D view: every local as a triad. No saved points belong to a local, so they start
// hidden (the Points chip shows them all).
const VIEW3D_OPTIONS: Cell3DOptions = { points: false, locals: true, sets: false, toggles: ["locals", "points"], fit: "items" };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocalsPage() {
  const pushOnce = usePushOnce();
  const locals      = useLocals();
  const status      = useRobotStatus();
  const activeLocal = status.activeLocal;

  // Optional live 3D (hidden by default, remembered on this device). The selected (active) local
  // is highlighted by its stable id; tapping a local's triad opens it.
  const [show3d, setShow3d] = useRememberedFlag("space.locals.view3d", false);
  const activeLocalId = (status as { activeLocalId?: unknown }).activeLocalId;
  const selected = locals.find(l => (typeof activeLocalId === "string" && activeLocalId ? l.id === activeLocalId : l.name === activeLocal)) ?? null;
  const highlight = useMemo<Cell3DTarget | null>(() => (selected?.id ? { kind: "local", id: selected.id } : null), [selected]);
  const onPick = useCallback((t: Cell3DTarget | null) => {
    if (t?.kind === "local") pushOnce(`/space/local-edit?id=${encodeURIComponent(t.id)}`);
  }, [pushOnce]);

  // Each local is edited on its own page, linked by the local's stable id.
  function openEdit(local: Local) {
    if (local.id) pushOnce(`/space/local-edit?id=${encodeURIComponent(local.id)}`);
  }

  function confirmDelete(name: string) {
    appAlert(
      "Delete Local",
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => robotClient.deleteLocal(name) },
      ]
    );
  }

  function toggleActiveLocal(name: string) {
    robotClient.setActiveLocal(activeLocal === name ? "None" : name);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <PageHeader title="Locals" subtitle="Local coordinate frames offset where point coordinates are measured from" right={<Space3DToggle on={show3d} onChange={setShow3d} />} />

      <SpaceList3DLayout show={show3d} persistKey="space-locals" options={VIEW3D_OPTIONS} highlight={highlight} onPick={onPick}>
      <Screen>
        <SectionHeader
          title="Saved locals"
          icon={Grid3x3}
          right={<InfoTip text="A local applies an offset and rotation to the coordinates the robot works in. Activate one to shift the origin your saved points are measured from; choose No Local to move in world coordinates." />}
        />

        {/* No-local row — always at top */}
        <Card padded={false}>
          <RadioRow
            title="No Local"
            subtitleNode={<Text style={styles.localCoords}>World origin (0, 0, 0)</Text>}
            selected={activeLocal === ""}
            onPress={() => robotClient.setActiveLocal("None")}
            tint={accents.purple}
            style={styles.radioRowPad}
            right={
              activeLocal === "" ? (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>Active</Text>
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Empty state */}
        {locals.length === 0 && (
          <EmptyState
            icon={<Grid3x3 size={28} color={colors.textFaint} />}
            title="No locals yet"
            subtitle="Tap below to define a coordinate system"
          />
        )}

        {/* Local list */}
        {locals.length > 0 && (
          <Card padded={false}>
            {locals.map((local, i) => {
              const isActive = activeLocal === local.name;
              const isLast   = i === locals.length - 1;
              return (
                <View key={local.name}>
                  <RadioRow
                    title={local.name}
                    subtitleNode={
                      <View>
                        {local.description ? (
                          <Text style={styles.localDesc} numberOfLines={1}>{local.description}</Text>
                        ) : null}
                        <Text style={styles.localCoords} numberOfLines={1}>
                          {local.x.toFixed(1)}, {local.y.toFixed(1)}, {local.z.toFixed(1)}
                          {"  ·  R "}
                          {local.rx.toFixed(1)}°, {local.ry.toFixed(1)}°, {local.rz.toFixed(1)}°
                        </Text>
                      </View>
                    }
                    selected={isActive}
                    onPress={() => toggleActiveLocal(local.name)}
                    tint={accents.purple}
                    style={[isActive && styles.localRowActive, styles.radioRowPad]}
                    right={
                      <View style={styles.rowActions}>
                        {isActive && (
                          <View style={styles.activeChip}>
                            <Text style={styles.activeChipText}>Active</Text>
                          </View>
                        )}

                        {/* Edit */}
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => openEdit(local)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${local.name}`}
                        >
                          <Edit2 size={16} color={colors.textMuted} />
                        </Pressable>

                        {/* Delete */}
                        <DeleteIconButton style={styles.iconBtn} onPress={() => confirmDelete(local.name)} />
                      </View>
                    }
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </Card>
        )}

        {/* Add local */}
        <Button
          variant="dashed"
          label="New Local"
          icon={<Plus size={16} color={accents.purple} />}
          style={styles.addCard}
          textStyle={styles.addCardText}
          onPress={() => pushOnce("/space/local-edit")}
        />

      </Screen>
      </SpaceList3DLayout>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  addCard: { borderColor: accents.purple },
  addCardText: { color: accents.purple },

  radioRowPad: {
    paddingHorizontal: spacing.md + 2,
  },
  localRowActive: {
    backgroundColor: accents.purpleSoft,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },

  localDesc: {
    fontSize: 12,
    color: colors.textFaint,
  },
  localCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },

  activeChip: {
    backgroundColor: accents.purpleSoft,
    borderRadius: radii.sm - 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: accents.purple,
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: spacing.xs,
  },
});
