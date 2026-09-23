import React, { ReactNode, useEffect, useRef } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Redo2, Undo2 } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/components/ui/kit";

/**
 * The builder's editing tools: undo / redo plus whatever the screen adds after them
 * (problem count, history). Rendered in the wide header's action slot, or as a slim
 * bar under the header on narrow screens where the header has no room.
 */
export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  children,
  variant,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  children?: ReactNode;
  variant: "header" | "bar";
}) {
  const mod = Platform.OS === "web" && typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
  const content = (
    <>
      <IconButton label={`Undo (${mod}Z)`} disabled={!canUndo} onPress={onUndo}>
        <Undo2 size={16} color={canUndo ? colors.textSecondary : colors.borderStrong} />
      </IconButton>
      <IconButton label={`Redo (${mod}Shift+Z)`} disabled={!canRedo} onPress={onRedo}>
        <Redo2 size={16} color={canRedo ? colors.textSecondary : colors.borderStrong} />
      </IconButton>
      {children}
    </>
  );
  return variant === "header"
    ? <View style={styles.row}>{content}</View>
    : <View style={styles.bar}><View style={styles.row}>{content}</View></View>;
}

/** Square icon button matching undo/redo, for tools the screen adds to the toolbar. */
export function ToolbarButton({ label, onPress, children }: {
  label: string; onPress: () => void; children: ReactNode;
}) {
  return <IconButton label={label} disabled={false} onPress={onPress}>{children}</IconButton>;
}

function IconButton({ label, disabled, onPress, children }: {
  label: string; disabled: boolean; onPress: () => void; children: ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      {children}
    </TouchableOpacity>
  );
}

/**
 * Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo — web only. Keys typed into a
 * text field are left alone so the field's own undo still works there.
 */
export function useUndoShortcuts({ enabled, onUndo, onRedo }: {
  enabled: boolean; onUndo: () => void; onRedo: () => void;
}) {
  const handlers = useRef({ onUndo, onRedo });
  handlers.current = { onUndo, onRedo };

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey)                      { e.preventDefault(); handlers.current.onUndo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); handlers.current.onRedo(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  bar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconBtnDisabled: { backgroundColor: colors.surfaceMuted },
});
