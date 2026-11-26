import AsyncStorage from "@react-native-async-storage/async-storage";
import { MapPin, Navigation, OctagonX, Pencil, RotateCw, Trash2, TriangleAlert, X } from "lucide-react-native";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { Button, colors, Divider, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import type { Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import type { Point } from "@/src/models/robotModels";
import { usePoints, useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

import { type ArrayCell, cellFromTarget, cellTarget } from "./arrayTargets";

export type MoveSpeedKey = "Slow" | "Normal" | "Fast";
export type MoveCommand = "MoveL" | "MoveJ";

/** The last continuous jog speed (written by Jog & Teach), so moves default to the jog selection. */
export const LAST_MOVE_SPEED_KEY = "lastMoveSpeed";

/** The robot counts as "at" a target when every translational axis is within this many mm. */
const AT_THRESHOLD = 0.5;
const isAt = (p: { x: number; y: number; z: number }, s: { x?: number; y?: number; z?: number }) =>
  Math.abs(p.x - (s.x ?? 0)) < AT_THRESHOLD && Math.abs(p.y - (s.y ?? 0)) < AT_THRESHOLD && Math.abs(p.z - (s.z ?? 0)) < AT_THRESHOLD;

/** Program states in which the robot belongs to the program, so no manual moves are offered. */
const BUSY = new Set(["Running", "Starting", "Finishing", "Stopping", "Stopped"]);

/**
 * A 3D view's picking: the point or grid cell / stack slot whose marker was tapped (by stable id;
 * a tap on empty space clears it) and the highlight that marks it while its sheet is open.
 *   const pick = usePointPick();
 *   <Cell3DView onPick={pick.onPick} highlight={pick.highlight} sets={…} />
 *   <PointActionSheet point={pick.point} onClose={pick.close} />
 *   <ArrayCellSheet cell={pick.cell} onClose={pick.close} />
 */
export function usePointPick() {
  const points = usePoints();
  const [picked, setPicked] = useState<{ pointId: string } | { cell: ArrayCell } | null>(null);
  const point = picked && "pointId" in picked ? points.find(p => p.id === picked.pointId) ?? null : null;
  const cell = picked && "cell" in picked ? picked.cell : null;
  const onPick = useCallback((t: Cell3DTarget | null) => {
    const c = cellFromTarget(t);
    setPicked(c ? { cell: c } : t?.kind === "point" ? { pointId: t.id } : null);
  }, []);
  const close = useCallback(() => setPicked(null), []);
  const cellKey = cell ? JSON.stringify(cell) : "";
  const pointId = point?.id;
  const highlight = useMemo<Cell3DTarget | null>(
    () => (pointId ? { kind: "point", id: pointId } : cellKey ? cellTarget(JSON.parse(cellKey)) : null),
    [pointId, cellKey],
  );
  return { point, cell, onPick, close, highlight };
}

/** What a move send reports back: an error to show, and which side resolved the target. */
export type MoveSendResult = { error?: string; resolvedBy?: "controller" | "app" } | void;

/** A target the sheet can move to. */
export type SheetMove = {
  /** Where the TCP ends up (world frame), for "already here"; null = always move. */
  at: { x: number; y: number; z: number } | null;
  /** The name shown while moving / in "already here". */
  label: string;
  /** Sends the move at `speed` (mm/s; undefined = the controller default). */
  send: (command: MoveCommand, speed: number | undefined) => Promise<MoveSendResult> | MoveSendResult;
};

/** An extra row under the moves (Edit, Delete…). */
export type SheetAction = { key: string; label: string; icon: ReactNode; onPress: () => void; destructive?: boolean };

/**
 * The shared move-target sheet (points, grid cells, stack slots): a title and coordinates, Line /
 * Joint move at the jog speed (with a STOP overlay for the move, an "already here" note and the
 * controller's refusal, e.g. out of reach), and the caller's extra actions. While a program is
 * running, or without `move`, it shows `noMovesNote` (or nothing) instead of the moves.
 *
 * Stays mounted: the move overlay outlives the sheet (`open` false = closed).
 */
export function MoveTargetSheet({
  open, onClose, icon, title, coords, caption, move, noMovesNote, speed, actions, body,
}: {
  open: boolean;
  onClose: () => void;
  icon?: ReactNode;
  title: string;
  coords?: { x: number; y: number; z: number; rz: number } | null;
  /** A faint line under the coordinates. */
  caption?: string;
  move?: SheetMove | null;
  /** Shown in place of the moves when there is no `move` (e.g. an unsaved edit). */
  noMovesNote?: string;
  /** Slow / Normal / Fast from the jog config; default: the last jog speed selection. */
  speed?: MoveSpeedKey;
  actions?: SheetAction[];
  /** Replaces the moves + actions (e.g. a delete confirm step). */
  body?: ReactNode;
}) {
  const status = useRobotStatus();
  const programs = useProgramSummaries();
  const busy = programs.some(p => BUSY.has(p.status));
  const [moving, setMoving] = useState<{ label: string; resolvedBy?: "controller" | "app"; seq: number } | null>(null);
  const [alreadyHere, setAlreadyHere] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ label: string; message: string } | null>(null);
  const [speeds, setSpeeds] = useState<Record<MoveSpeedKey, number> | null>(null);
  const [lastSpeed, setLastSpeed] = useState<MoveSpeedKey>("Normal");

  // Each time the sheet opens: the jog speeds (config may have changed) and the last jog speed.
  useEffect(() => {
    if (!open) return;
    robotClient.getRobotConfig()
      .then(cfg => setSpeeds({ Slow: cfg.jogSlowSpeed, Normal: cfg.jogNormalSpeed, Fast: cfg.jogFastSpeed }))
      .catch(() => {});
    if (!speed) {
      AsyncStorage.getItem(LAST_MOVE_SPEED_KEY)
        .then(v => { if (v === "Slow" || v === "Normal" || v === "Fast") setLastSpeed(v); })
        .catch(() => {});
    }
  }, [open, speed]);

  // The overlay closes when the move ends (the robot's moving flag drops).
  const [wasMoving, setWasMoving] = useState(status.moving);
  if (status.moving !== wasMoving) {
    setWasMoving(status.moving);
    if (!status.moving && moving) setMoving(null);
  }

  const speedKey = speed ?? lastSpeed;

  function doMove(command: MoveCommand) {
    if (!move) return;
    if (move.at && isAt(move.at, status)) { setAlreadyHere(move.label); onClose(); return; }
    const seq = Date.now();
    const label = move.label;
    setMoving({ label, seq });
    onClose();
    Promise.resolve(move.send(command, speeds?.[speedKey]))
      .then(r => {
        if (r?.error) {
          setMoving(m => (m?.seq === seq ? null : m));
          setRefused({ label, message: r.error });
        } else if (r?.resolvedBy) {
          setMoving(m => (m?.seq === seq ? { ...m, resolvedBy: r.resolvedBy } : m));
        }
      })
      .catch(() => {});
  }

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={st.overlay} onPress={onClose}>
          <Pressable style={st.dialog} onPress={() => {}}>
            <View style={st.header}>
              <View style={st.titleRow}>
                {icon ?? <MapPin size={16} color={colors.textMuted} style={{ marginTop: 1 }} />}
                <Text style={st.title} numberOfLines={2}>{title}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>
            {!!coords && (
              <Text style={[st.coords, !!caption && st.coordsTight]}>
                X {coords.x.toFixed(1)}{"  "}Y {coords.y.toFixed(1)}{"  "}Z {coords.z.toFixed(1)}{"  "}RZ {coords.rz.toFixed(1)}
              </Text>
            )}
            {!!caption && <Text style={st.caption}>{caption}</Text>}
            <Divider style={st.divider} />

            {body ?? (
              <>
                {move && busy ? (
                  <Text style={st.note}>A program is running, so moves are off until it ends.</Text>
                ) : move ? (
                  <>
                    <Pressable style={st.row} onPress={() => doMove("MoveL")}>
                      <Navigation size={18} color={colors.accent} />
                      <Text style={st.rowText}>Line Move</Text>
                      <Text style={st.rowHint}>{speedKey}</Text>
                    </Pressable>
                    <Pressable style={st.row} onPress={() => doMove("MoveJ")}>
                      <RotateCw size={18} color={colors.accent} />
                      <Text style={st.rowText}>Joint Move</Text>
                      <Text style={st.rowHint}>{speedKey}</Text>
                    </Pressable>
                  </>
                ) : noMovesNote ? (
                  <Text style={st.note}>{noMovesNote}</Text>
                ) : null}
                {(actions ?? []).map((a, i, all) => (
                  <AnimatedPressable key={a.key} style={[st.row, i === all.length - 1 && st.rowLast]} onPress={a.onPress}>
                    {a.icon}
                    <Text style={a.destructive ? st.deleteText : st.rowText}>{a.label}</Text>
                  </AnimatedPressable>
                ))}
                {!actions?.length && (
                  <Pressable style={[st.row, st.rowLast]} onPress={onClose}>
                    <X size={18} color={colors.textMuted} />
                    <Text style={st.cancelText}>Cancel</Text>
                  </Pressable>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* The move in progress, with STOP on screen for all of it. */}
      <Modal visible={!!moving} transparent animationType="fade">
        <View style={st.overlay}>
          <View style={st.stopCard}>
            <Navigation size={28} color={colors.accent} />
            <Text style={st.stopTitle}>Moving to</Text>
            {!!moving && <Text style={st.stopName} numberOfLines={2}>{moving.label}</Text>}
            {!!moving?.resolvedBy && (
              <Text style={st.stopPath}>
                {moving.resolvedBy === "controller" ? "Target resolved by the controller" : "Target resolved by the app"}
              </Text>
            )}
            <Button
              label="STOP"
              variant="destructive"
              icon={<OctagonX size={22} color={colors.onAccent} />}
              onPress={() => { robotClient.sendCommand("HardStop"); setMoving(null); }}
              style={st.stopButton}
              textStyle={st.stopButtonText}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!alreadyHere} transparent animationType="fade" onRequestClose={() => setAlreadyHere(null)}>
        <Pressable style={st.overlay} onPress={() => setAlreadyHere(null)}>
          <Pressable style={st.hereCard} onPress={() => {}}>
            <MapPin size={28} color={colors.accent} />
            <Text style={st.hereTitle}>Already Here</Text>
            <Text style={st.hereBody}>
              The robot is already at{"\n"}<Text style={{ fontWeight: "700" }}>{alreadyHere}</Text>
            </Text>
            <Button label="OK" variant="primary" style={st.hereButton} onPress={() => setAlreadyHere(null)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!refused} transparent animationType="fade" onRequestClose={() => setRefused(null)}>
        <Pressable style={st.overlay} onPress={() => setRefused(null)}>
          <Pressable style={st.hereCard} onPress={() => {}}>
            <TriangleAlert size={28} color={colors.danger} />
            <Text style={st.hereTitle}>Move refused</Text>
            <Text style={st.hereBody}>
              <Text style={{ fontWeight: "700" }}>{refused?.label}</Text>{"\n"}{refused?.message}
            </Text>
            <Button label="OK" variant="primary" style={st.hereButton} onPress={() => setRefused(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * The point action sheet shared by Space › Points and every 3D view that shows points: the point's
 * name and coordinates, Line / Joint move at the jog speed, and optionally Edit / Delete. Moves go
 * by the point's name, as the Points page always has. While a program is running there are no moves.
 */
export function PointActionSheet({
  point, onClose, speed, onEdit, onDelete, extraActions, title,
}: {
  point: Point | null;
  onClose: () => void;
  speed?: MoveSpeedKey;
  /** Shown as "Edit Point" when given (the caller opens its editor). */
  onEdit?: (p: Point) => void;
  /** Shown as "Delete" with a confirm step when given. */
  onDelete?: (p: Point) => void;
  /** Extra rows (e.g. "Re-teach") appended after Edit, before Delete. */
  extraActions?: (p: Point) => SheetAction[];
  /** Overrides the sheet title (default: the point name). */
  title?: string;
}) {
  // The delete confirm step, for this point only (a new point opens on the actions).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmDelete = !!point && confirmId === (point.id || point.name);
  const setConfirmDelete = (on: boolean) => setConfirmId(on && point ? point.id || point.name : null);

  const move = useMemo<SheetMove | null>(() => (point ? {
    at: point,
    label: point.name,
    send: (command, speed) => { robotClient.sendCommand(command, { name: point.name, speed }).catch(() => {}); },
  } : null), [point]);

  const actions: SheetAction[] = [];
  if (onEdit) actions.push({ key: "edit", label: "Edit Point", icon: <Pencil size={18} color={colors.accent} />, onPress: () => point && onEdit(point) });
  if (point && extraActions) actions.push(...extraActions(point));
  if (onDelete) actions.push({ key: "delete", label: "Delete", icon: <Trash2 size={18} color={colors.danger} />, onPress: () => setConfirmDelete(true), destructive: true });

  return (
    <MoveTargetSheet
      open={!!point}
      onClose={onClose}
      title={title ?? point?.name ?? ""}
      coords={point}
      move={move}
      speed={speed}
      actions={actions}
      body={confirmDelete ? (
        <>
          <Text style={st.confirmText}>
            Delete <Text style={{ fontWeight: "700" }}>{point?.name}</Text>? This cannot be undone.
          </Text>
          <View style={st.confirmButtons}>
            <Button label="Cancel" variant="secondary" style={st.flex} onPress={() => setConfirmDelete(false)} />
            <Button
              label="Delete"
              variant="destructive"
              style={st.flex}
              icon={<Trash2 size={15} color={colors.onAccent} />}
              onPress={() => { if (point && onDelete) onDelete(point); onClose(); }}
            />
          </View>
        </>
      ) : undefined}
    />
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center" },
  dialog: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.lg + 2,
    ...shadows.raised,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  coords: { ...type.mono, fontSize: 11, color: colors.textFaint, marginBottom: spacing.md + 2 },
  coordsTight: { marginBottom: 2 },
  caption: { ...type.caption, fontSize: 11, marginBottom: spacing.md + 2 },
  divider: { marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.background,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { fontSize: 15, color: colors.accent, fontWeight: "500", flex: 1 },
  rowHint: { ...type.caption, fontSize: 12 },
  deleteText: { fontSize: 15, color: colors.danger, fontWeight: "500" },
  cancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: "500" },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 19, paddingVertical: spacing.md },
  confirmText: { fontSize: 14, color: colors.textSecondary, marginVertical: spacing.md, lineHeight: 20 },
  confirmButtons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.xs },
  flex: { flex: 1 },
  stopCard: {
    width: 260,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.raised,
  },
  stopTitle: { fontSize: 15, color: colors.textSecondary, fontWeight: "600", marginTop: spacing.xs },
  stopName: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  stopPath: { ...type.caption, fontSize: 11, textAlign: "center" },
  stopButton: { borderRadius: radii.md, paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl - 4, marginTop: spacing.sm },
  stopButtonText: { fontSize: 18, fontWeight: "bold", letterSpacing: 2 },
  hereCard: {
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.xs + 2,
    ...shadows.raised,
  },
  hereTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  hereBody: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 20, marginBottom: spacing.sm },
  hereButton: { paddingHorizontal: spacing.xl - 4, marginTop: spacing.xs },
});
