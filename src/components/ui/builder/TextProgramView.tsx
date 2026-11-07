import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Code } from "lucide-react-native";
import { Button, colors, radii, spacing } from "@/src/components/ui/kit";
import type { BuiltProgram, ValidationProblem } from "@/src/models/robotModels";
import type { BreakpointsView } from "./useBreakpoints";

/**
 * The Text view of the program builder (controller docs/program-language.md §7). Package F
 * fills this in: FormatProgramText on mount, a CodeMirror editor, a debounced
 * ParseProgramText, diagnostics, the run-line highlight and the mobile key row. The props are
 * the contract the builder already provides.
 */
export type TextProgramViewProps = {
  /** The current (possibly unsaved) document as a program — the text is generated from it. */
  program: BuiltProgram;
  /**
   * Commit a successfully parsed program to the document as ONE undoable edit (the builder
   * replaces steps and variables; metadata stays as edited in the header).
   */
  onApply: (program: BuiltProgram) => void;
  /** Leave Text for Blocks (e.g. from an error sheet's "discard text changes"). */
  onSwitchToBlocks: () => void;
  /** Text editing needs a controller; offline the view is read-only with a banner. */
  connected: boolean;
  /** The builder's live validation problems (mapped to lines through the text map). */
  problems?: ValidationProblem[];
  /** Step-id breakpoints shared with Blocks and the monitor. */
  breakpoints?: BreakpointsView;
  /** The step the running program is on (status currentStepId), for the line highlight. */
  runningStepId?: string | null;
};

/** Stub: says the text editor is coming and offers the way back to Blocks. */
export function TextProgramView({ onSwitchToBlocks }: TextProgramViewProps) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Code size={28} color={colors.borderStrong} />
      <Text style={styles.title}>Text editor coming</Text>
      <Text style={styles.body}>
        Soon you can read and write this program as text. The blocks are unchanged — switch back to keep editing.
      </Text>
      <Button label="Back to Blocks" variant="secondary" onPress={onSwitchToBlocks} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  body: { fontSize: 13, color: colors.textMuted, textAlign: "center", maxWidth: 360 },
});
