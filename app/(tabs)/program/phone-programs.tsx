import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BuiltProgram } from "@/src/models/robotModels";
import { useConnected } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { FileJson,
  Plus,
  Repeat2,
  Smartphone,
  Trash2,
  Upload } from "lucide-react-native";
import { useCallback,
  useEffect,
  useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Button, Card, EmptyState, Screen, accents, colors, radii, spacing } from "@/src/components/ui/kit";

// Local/phone feature tint — base color via the kit's purple accent family
// (used consistently for on-device/routine content across the program
// screens). bg/border/pillBg are deliberately lighter/pill shades with no
// exact kit token match — kept literal.
const LOCAL_TINT = { color: accents.purple, bg: "#faf5ff", border: "#e9d5ff", pillBg: "#ede9fe" };

// ── Local Program Card ────────────────────────────────────────────────────────

function LocalProgramCard({
  program,
  connected,
  onRefresh,
}: {
  program: BuiltProgram;
  connected: boolean;
  onRefresh: () => void;
}) {
  async function handleSendToRobot() {
    try {
      await robotClient.saveBuiltProgram(program);
      appAlert("Saved to Robot", `"${program.name}" has been saved to the robot.`);
    } catch {
      appAlert("Error", "Failed to save program to robot.");
    }
  }

  async function handleExport() {
    try {
      await LocalProgramService.exportAsFile(program);
    } catch (e: any) {
      appAlert("Export Failed", e?.message ?? "Could not export program.");
    }
  }

  function handleDelete() {
    appAlert(
      "Delete Local Program",
      `Delete "${program.name}" from this device? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await LocalProgramService.delete(program.name);
            onRefresh();
          },
        },
      ]
    );
  }

  return (
    <Card
      onPress={() => router.push(`/program/builder?name=${encodeURIComponent(program.name)}&source=local`)}
      padded={false}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Smartphone size={10} color={LOCAL_TINT.color} />
        <Text style={styles.cardBadgeText}>ON DEVICE</Text>
        {program.isRoutine && (
          <View style={styles.routinePill}>
            <Repeat2 size={9} color={LOCAL_TINT.color} />
            <Text style={styles.routinePillText}>ROUTINE</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.programName} numberOfLines={1}>{program.name}</Text>
        <Text style={styles.programDesc} numberOfLines={2}>{program.description || "No description"}</Text>
        <Text style={styles.stepCount}>{program.steps.length} step{program.steps.length !== 1 ? "s" : ""}</Text>
      </View>

      <View style={styles.cardActions}>
        {connected && (
          <Button
            label="Send to Robot"
            icon={<Upload size={13} color={colors.success} />}
            variant="secondary"
            size="sm"
            style={[styles.actionBtn, { borderColor: colors.success }]}
            textStyle={{ color: colors.success }}
            onPress={(e) => { e.stopPropagation?.(); handleSendToRobot(); }}
          />
        )}
        <Button
          label="Export"
          icon={<FileJson size={13} color={colors.textMuted} />}
          variant="secondary"
          size="sm"
          style={styles.actionBtn}
          textStyle={{ color: colors.textMuted }}
          onPress={(e) => { e.stopPropagation?.(); handleExport(); }}
        />
        <Button
          label="Delete"
          icon={<Trash2 size={13} color={colors.danger} />}
          variant="secondary"
          size="sm"
          style={[styles.actionBtn, { borderColor: colors.danger }]}
          textStyle={{ color: colors.danger }}
          onPress={(e) => { e.stopPropagation?.(); handleDelete(); }}
        />
      </View>
    </Card>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PhoneProgramsScreen() {
  const connected = useConnected();
  const [programs, setPrograms] = useState<BuiltProgram[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    LocalProgramService.getAll().then(setPrograms);
  }, [tick]);

  async function handleImport() {
    try {
      const prog = await LocalProgramService.importFromFile();
      if (!prog) return;
      const existing = programs.find(p => p.name === prog.name);
      if (existing) {
        appAlert(
          "Program Already Exists",
          `A local program named "${prog.name}" already exists. Replace it?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Replace",
              style: "destructive",
              onPress: async () => {
                await LocalProgramService.save(prog);
                refresh();
              },
            },
          ]
        );
      } else {
        await LocalProgramService.save(prog);
        refresh();
      }
    } catch (e: any) {
      appAlert("Import Failed", e?.message ?? "Could not read the file.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubPageHeader
        title="On Phone"
        right={
          <Button
            label="Import"
            icon={<FileJson size={14} color={LOCAL_TINT.color} />}
            variant="ghost"
            size="sm"
            style={{ backgroundColor: LOCAL_TINT.bg }}
            textStyle={{ color: LOCAL_TINT.color }}
            onPress={handleImport}
          />
        }
      />
      <Screen>
        {programs.length === 0 ? (
          <EmptyState
            icon={<Smartphone size={32} color={colors.textFaint} />}
            title="No Local Programs"
            subtitle="Create a program below or import a .json file to get started."
          />
        ) : (
          programs.map(p => (
            <LocalProgramCard key={p.name} program={p} connected={connected} onRefresh={refresh} />
          ))
        )}

        <TouchableOpacity
          style={[styles.addCard, { borderColor: LOCAL_TINT.color }]}
          onPress={() => router.push("/program/builder?source=local")}
          activeOpacity={0.7}
        >
          <Plus size={16} color={LOCAL_TINT.color} />
          <Text style={[styles.addCardText, { color: LOCAL_TINT.color }]}>New Local Program</Text>
        </TouchableOpacity>
      </Screen>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderLeftWidth: 3,
    borderLeftColor: LOCAL_TINT.color,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    backgroundColor: LOCAL_TINT.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LOCAL_TINT.border,
  },
  cardBadgeText: { flex: 1, fontSize: 10, fontWeight: "700", color: LOCAL_TINT.color, letterSpacing: 0.4 },
  routinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: LOCAL_TINT.pillBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  routinePillText: { fontSize: 10, fontWeight: "700", color: LOCAL_TINT.color },

  cardBody:    { padding: spacing.md + 2, paddingBottom: spacing.sm, gap: 3 },
  programName: { fontSize: 16, fontWeight: "700", color: colors.text },
  programDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  stepCount:   { fontSize: 11, color: colors.textFaint, marginTop: 2 },

  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingBottom: spacing.md + 2,
  },
  actionBtn: { flex: 1 },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600" },
});
