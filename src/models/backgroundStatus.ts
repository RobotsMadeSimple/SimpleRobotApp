import type { BackgroundProgramStatus, BuiltProgram } from "./robotModels";

/**
 * The running-status entry for a background program, matched by its stable id. A controller
 * that predates the id in status reports only names, so an entry without an id falls back to
 * the name.
 */
export function findBackgroundStatus(
  statuses: readonly BackgroundProgramStatus[] | undefined,
  program: Pick<BuiltProgram, "id" | "name">,
): BackgroundProgramStatus | null {
  for (const s of statuses ?? []) {
    if (s.id ? (!!program.id && s.id === program.id) : s.name === program.name) return s;
  }
  return null;
}
