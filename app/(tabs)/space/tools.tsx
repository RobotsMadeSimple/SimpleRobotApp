import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import {
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
import { Tool } from "@/src/models/robotModels";
import { useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Edit2, Plus, Wrench } from "lucide-react-native";
import { usePushOnce } from "@/src/hooks/usePushOnce";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Space3DToggle, SpaceList3DLayout, useRememberedFlag } from "@/src/components/space/space3d";
import type { Cell3DOptions, Cell3DPreview } from "@/src/components/ui/cell3d/bridge";
import { useMemo } from "react";

// The optional 3D view: the active tool's TCP at the live flange. No saved points belong to a
// tool, so they start hidden (the Points chip shows them all).
const VIEW3D_OPTIONS: Cell3DOptions = { points: false, locals: false, sets: false, toggles: ["points", "locals", "sets"], fit: "robot" };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const pushOnce = usePushOnce();
  const tools      = useTools();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;

  // Optional live 3D (hidden by default, remembered on this device): the selected (active) tool's
  // TCP drawn at the flange, by its stable id.
  const [show3d, setShow3d] = useRememberedFlag("space.tools.view3d", false);
  const activeToolId = (status as { activeToolId?: unknown }).activeToolId;
  const selected = tools.find(t => (typeof activeToolId === "string" && activeToolId ? t.id === activeToolId : t.name === activeTool)) ?? null;
  const toolPreview = useMemo<Cell3DPreview | null>(
    () => (selected ? { kind: "tool", id: selected.id, name: selected.name, x: selected.x, y: selected.y, z: selected.z } : null),
    [selected],
  );

  // Each tool is edited on its own page, linked by the tool's stable id.
  function openEdit(tool: Tool) {
    if (tool.id) pushOnce(`/space/tool-edit?id=${encodeURIComponent(tool.id)}`);
  }

  function confirmDelete(name: string) {
    appAlert(
      "Delete Tool",
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => robotClient.deleteTool(name) },
      ]
    );
  }

  function toggleActiveTool(name: string) {
    robotClient.setActiveTool(activeTool === name ? "None" : name);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <PageHeader title="Tools" subtitle="Define TCP offsets and pick the active tool" right={<Space3DToggle on={show3d} onChange={setShow3d} />} />

      <SpaceList3DLayout show={show3d} persistKey="space-tools" options={VIEW3D_OPTIONS} preview={toolPreview}>
      <Screen>
        <SectionHeader
          title="Saved tools"
          icon={Wrench}
          right={<InfoTip text="A tool's offset defines its TCP (tool center point) relative to the robot flange. Activate a tool so saved points and moves target that offset instead of the raw flange position." />}
        />

        {/* No-tool row — always at top */}
        <Card padded={false}>
          <RadioRow
            title="No Tool"
            subtitleNode={<Text style={styles.toolCoords}>Origin (0, 0, 0)</Text>}
            selected={activeTool === ""}
            onPress={() => robotClient.setActiveTool("None")}
            style={styles.radioRowPad}
            right={
              activeTool === "" ? (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>Active</Text>
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Empty state */}
        {tools.length === 0 && (
          <EmptyState
            icon={<Wrench size={28} color={colors.textFaint} />}
            title="No tools yet"
            subtitle="Tap below to define a TCP offset"
          />
        )}

        {/* Tool list */}
        {tools.length > 0 && (
          <Card padded={false}>
            {tools.map((tool, i) => {
              const isActive = activeTool === tool.name;
              const isLast   = i === tools.length - 1;
              return (
                <View key={tool.name}>
                  <RadioRow
                    title={tool.name}
                    subtitleNode={
                      tool.description ? (
                        <Text style={styles.toolDesc} numberOfLines={1}>{tool.description}</Text>
                      ) : (
                        <Text style={styles.toolCoords}>
                          {tool.x.toFixed(1)}, {tool.y.toFixed(1)}, {tool.z.toFixed(1)}
                        </Text>
                      )
                    }
                    selected={isActive}
                    onPress={() => toggleActiveTool(tool.name)}
                    style={[isActive && styles.toolRowActive, styles.radioRowPad]}
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
                          onPress={() => openEdit(tool)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${tool.name}`}
                        >
                          <Edit2 size={16} color={colors.textMuted} />
                        </Pressable>

                        {/* Delete */}
                        <DeleteIconButton style={styles.iconBtn} onPress={() => confirmDelete(tool.name)} />
                      </View>
                    }
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </Card>
        )}

        {/* Add tool — outlined continuation card */}
        <Button
          variant="dashed"
          label="New Tool"
          icon={<Plus size={16} color={colors.accent} />}
          onPress={() => pushOnce("/space/tool-edit")}
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

  // ── Tool row ──────────────────────────────────────────────────────────────
  radioRowPad: {
    paddingHorizontal: spacing.md + 2,
  },
  toolRowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },

  toolDesc: {
    fontSize: 12,
    color: colors.textFaint,
  },
  toolCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
  },

  activeChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm - 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: spacing.xs,
  },
});
