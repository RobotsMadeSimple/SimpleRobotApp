import { wide } from "@/src/components/ui/responsive";
import {
  SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
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
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

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
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/program/builder?name=${encodeURIComponent(program.name)}&source=local`)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Smartphone size={10} color="#7c3aed" />
        <Text style={styles.cardBadgeText}>ON DEVICE</Text>
        {program.isRoutine && (
          <View style={styles.routinePill}>
            <Repeat2 size={9} color="#7c3aed" />
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
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: "#16a34a" }]}
            onPress={(e) => { e.stopPropagation?.(); handleSendToRobot(); }}
            activeOpacity={0.75}
          >
            <Upload size={13} color="#16a34a" />
            <Text style={[styles.actionBtnText, { color: "#16a34a" }]}>Send to Robot</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: "#6b7280" }]}
          onPress={(e) => { e.stopPropagation?.(); handleExport(); }}
          activeOpacity={0.75}
        >
          <FileJson size={13} color="#6b7280" />
          <Text style={[styles.actionBtnText, { color: "#6b7280" }]}>Export</Text>
        </TouchableOpacity>
        <AnimatedPressable
          style={[styles.actionBtn, { borderColor: "#dc2626" }]}
          onPress={(e) => { e.stopPropagation?.(); handleDelete(); }}
        >
          <Trash2 size={13} color="#dc2626" />
          <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Delete</Text>
        </AnimatedPressable>
      </View>
    </TouchableOpacity>
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
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title="On Phone"
        right={
          <TouchableOpacity style={styles.importBtn} onPress={handleImport} activeOpacity={0.7}>
            <FileJson size={14} color="#7c3aed" />
            <Text style={styles.importBtnText}>Import</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, wide.content]}
        showsVerticalScrollIndicator={false}
      >
        {programs.length === 0 ? (
          <View style={styles.empty}>
            <Smartphone size={44} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Local Programs</Text>
            <Text style={styles.emptySubtitle}>
              Create a program below or import a .json file to get started.
            </Text>
          </View>
        ) : (
          programs.map(p => (
            <LocalProgramCard key={p.name} program={p} connected={connected} onRefresh={refresh} />
          ))
        )}

        <TouchableOpacity
          style={styles.addCard}
          onPress={() => router.push("/program/builder?source=local")}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#7c3aed" />
          <Text style={styles.addCardText}>New Local Program</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:  { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderLeftWidth: 3,
    borderLeftColor: "#7c3aed",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#faf5ff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e9d5ff",
  },
  cardBadgeText: { flex: 1, fontSize: 10, fontWeight: "700", color: "#7c3aed", letterSpacing: 0.4 },
  routinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ede9fe",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  routinePillText: { fontSize: 10, fontWeight: "700", color: "#7c3aed" },

  cardBody:    { padding: 14, paddingBottom: 10, gap: 3 },
  programName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  programDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  stepCount:   { fontSize: 11, color: "#9ca3af", marginTop: 2 },

  cardActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: "600" },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#7c3aed" },

  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f5f3ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  importBtnText: { fontSize: 13, fontWeight: "600", color: "#7c3aed" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 24,
    gap: 12,
  },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
