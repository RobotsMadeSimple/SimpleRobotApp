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
import { router } from "expo-router";
import { Edit2, Grid3x3, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocalsPage() {
  const locals      = useLocals();
  const status      = useRobotStatus();
  const activeLocal = status.activeLocal;

  // Each local is edited on its own page, linked by the local's stable id.
  function openEdit(local: Local) {
    if (local.id) router.push(`/space/local-edit?id=${encodeURIComponent(local.id)}`);
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
      <PageHeader title="Locals" subtitle="Local coordinate frames offset where point coordinates are measured from" />

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
          onPress={() => router.push("/space/local-edit")}
        />

      </Screen>
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
