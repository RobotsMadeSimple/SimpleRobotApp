import { Grid3x3, Layers, Pencil } from "lucide-react-native";
import { useMemo } from "react";

import { colors } from "@/src/components/ui/kit";
import type { Grid, RobotStack } from "@/src/models/robotModels";
import { useGrids, useLocals, usePoints, useRobotStatus, useStacks } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

import { type ArrayCell, resolveCell } from "./arrayTargets";
import { type MoveSendResult, type MoveSpeedKey, MoveTargetSheet, type SheetAction, type SheetMove } from "./PointActionSheet";

/** The controller's refusal codes for a move to a cell, in words. */
const REFUSALS: Record<string, string> = {
  outOfReach: "The robot can't reach this cell with the active tool and joint limits.",
  indexOutOfRange: "This cell is outside the array on the controller.",
  pointNotFound: "The array or its base point is missing on the controller.",
  estopActive: "The e-stop is active.",
  estopLatched: "The e-stop is latched: reset it first.",
};

/**
 * Line / Joint move to one grid cell or stack slot (a tap on its marker in a 3D view), on the
 * shared move-target sheet: "Tray · row 2, col 3" with the cell's coordinates and the index a
 * program uses. The move goes by the array's stable id — `{ grid, row, col }` / `{ stack, index }`,
 * which the controller resolves through MoveTargetResolver (rotation, active local and tool as a
 * program move) and reach-checks — and also carries the app's own resolved x…rz, which a
 * controller without that target uses instead (the ACK's `resolvedBy` says which ran).
 *
 * Stays mounted (`cell` null = closed).
 */
export function ArrayCellSheet({
  cell, onClose, speed, onEdit, draft,
}: {
  cell: ArrayCell | null;
  onClose: () => void;
  speed?: MoveSpeedKey;
  /** Shown as "Edit grid" / "Edit stack" (the caller opens its editor). */
  onEdit?: (cell: ArrayCell) => void;
  /**
   * The grid / stack being edited, under the id its preview draws with: its cells show from the
   * unsaved values with `note` and no moves (a cell of an unsaved edit has nothing to move to).
   */
  draft?: { kind: "grid" | "stack"; id: string; item: Grid | RobotStack; note: string } | null;
}) {
  const grids = useGrids();
  const stacks = useStacks();
  const points = usePoints();
  const locals = useLocals();
  const activeLocal = useRobotStatus().activeLocal;

  const isDraft = !!cell && !!draft && draft.kind === cell.kind && draft.id === cell.id;
  const resolved = useMemo(
    () => (cell ? resolveCell(cell, { grids, stacks, points, locals, activeLocal }, isDraft ? draft!.item : null) : null),
    [cell, grids, stacks, points, locals, activeLocal, isDraft, draft],
  );

  const move = useMemo<SheetMove | null>(() => {
    if (!cell || !resolved || isDraft || resolved.outside) return null;
    const w = resolved.world;
    return {
      at: w,
      label: resolved.title,
      send: async (command, speedMmS): Promise<MoveSendResult> => {
        const target = cell.kind === "grid" ? { grid: cell.id, row: cell.row, col: cell.col } : { stack: cell.id, index: cell.index };
        try {
          const ack = await robotClient.sendCommand(command, {
            ...target,
            // The fallback target: an older controller ignores grid / stack and moves here.
            x: w.x, y: w.y, z: w.z, rx: w.rx, ry: w.ry, rz: w.rz,
            speed: speedMmS,
          }) as { resolvedBy?: string } | undefined;
          return { resolvedBy: ack?.resolvedBy === "controller" ? "controller" : "app" };
        } catch (e) {
          const code = String(e);
          return { error: REFUSALS[code] ?? code };
        }
      },
    };
  }, [cell, resolved, isDraft]);

  const kindWord = cell?.kind === "stack" ? "stack" : "grid";
  const actions: SheetAction[] = onEdit && cell && !isDraft
    ? [{ key: "edit", label: `Edit ${kindWord}`, icon: <Pencil size={18} color={colors.accent} />, onPress: () => onEdit(cell) }]
    : [];
  const Icon = cell?.kind === "stack" ? Layers : Grid3x3;

  return (
    <MoveTargetSheet
      open={!!cell}
      onClose={onClose}
      icon={<Icon size={16} color={colors.textMuted} style={{ marginTop: 1 }} />}
      title={resolved?.title ?? (cell ? `${kindWord === "grid" ? "Grid cell" : "Stack slot"}` : "")}
      coords={resolved?.world ?? null}
      caption={resolved ? `In programs: ${resolved.programIndex}` : undefined}
      move={move}
      noMovesNote={
        isDraft ? draft!.note
          : !resolved ? `This ${kindWord} or its base point is no longer saved.`
            : resolved.outside ? `This cell is outside the ${kindWord}.` : undefined
      }
      speed={speed}
      actions={actions}
    />
  );
}
