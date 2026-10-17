import { Brackets, Cog, MoveHorizontal, RotateCw, type LucideIcon } from "lucide-react-native";

// Shared metadata for aux-axis roles — keeps the role picker (config page) and the
// per-axis controls (auxiliary device page) using the same icons and labels.

export type AuxRole = "Generic" | "Gripper" | "Conveyor" | "RotaryTable";

/** Selectable roles, in display order. */
export const AUX_ROLES: AuxRole[] = ["Generic", "Gripper", "Conveyor", "RotaryTable"];

type RoleMeta = { label: string; icon: LucideIcon };

const META: Record<AuxRole, RoleMeta> = {
  Generic:     { label: "Generic",  icon: Cog },
  Gripper:     { label: "Gripper",  icon: Brackets },
  Conveyor:    { label: "Conveyor", icon: MoveHorizontal },
  RotaryTable: { label: "Rotary",   icon: RotateCw },
};

/** Icon + label for a role string (unknown/empty falls back to Generic). */
export function auxRoleMeta(role: string | undefined): RoleMeta {
  return META[(role as AuxRole)] ?? META.Generic;
}
