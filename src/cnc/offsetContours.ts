// Contour offsetting (tool-radius compensation) for the CNC contour follower.
//
// Uses Clipper's polygon offsetter, which handles the hard parts miter math
// can't: concave corners, self-intersection cleanup, and shapes that split
// into multiple loops when offset inward. Corners are joined with arcs so the
// offset path stays a constant distance from the original.
//
// Each closed contour is treated independently: it's normalized to CCW
// orientation, then "outside" expands it and "inside" shrinks it by the given
// distance. Open contours can't be offset unambiguously (there is no inside)
// and pass through unchanged.

import * as ClipperLib from "clipper-lib";
import { Contour } from "./contours";

export type ContourOffsetMode = "none" | "outside" | "inside";

// Clipper works in integers — scale mm by 1000 (µm resolution).
const SCALE = 1000;

export function offsetContours(
  contours: Contour[],
  mode: ContourOffsetMode,
  distance: number,
): Contour[] {
  if (mode === "none" || distance <= 0) return contours;

  const out: Contour[] = [];
  for (const c of contours) {
    if (!c.closed || c.points.length < 4) {
      out.push(c); // open contours pass through unchanged
      continue;
    }

    // Drop the duplicated closing point; Clipper wants an implicit close.
    const path = c.points.slice(0, -1).map(p => ({
      X: Math.round(p.x * SCALE),
      Y: Math.round(p.y * SCALE),
    }));

    // Normalize to CCW so positive delta always means "expand outward"
    if (!ClipperLib.Clipper.Orientation(path)) path.reverse();

    const delta = (mode === "outside" ? 1 : -1) * distance * SCALE;
    const co = new ClipperLib.ClipperOffset(2, 0.05 * SCALE); // arc tol: 0.05 mm
    co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const solution: ClipperLib.Paths = [];
    co.Execute(solution, delta);

    // Inward offsets can vanish (contour smaller than the offset) or split
    // into several loops — emit whatever survived.
    for (const sol of solution) {
      if (sol.length < 3) continue;
      const pts = sol.map(ip => ({ x: ip.X / SCALE, y: ip.Y / SCALE }));
      pts.push({ ...pts[0] }); // re-close explicitly
      out.push({ points: pts, closed: true });
    }
  }
  return out;
}
