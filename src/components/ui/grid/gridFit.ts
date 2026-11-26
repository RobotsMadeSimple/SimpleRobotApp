/**
 * Grid teaching math — turns 2, 3 or 4 taught corner positions into a controller Grid:
 *   cell(row, col) = origin + row · rowStep + col · colStep        (world frame, rotation 0)
 * which is exactly what the controller's MoveTargetResolver.GridCell computes. Pure, no React.
 *
 * Corners (taught at the CENTRE of the cell, with the tool that will work the grid):
 *   2-point  A = cell(0, 0)        D = cell(R-1, C-1)        square, orthogonal cells; mirror pick
 *   3-point  A = cell(0, 0)        B = cell(0, C-1)  C = cell(R-1, 0)       any parallelogram
 *   4-point  A, B, C as above  +   D = cell(R-1, C-1)        least-squares fit, residual per corner
 */

export type Vec3 = { x: number; y: number; z: number };
export type Pose = Vec3 & { rx: number; ry: number; rz: number };

export type GridMethod = "2pt" | "3pt" | "4pt";
export type CornerKey = "A" | "B" | "C" | "D";

/**
 * 2-point only: which side of the first row (looking along it, from cell (0,0) toward the
 * first row's last cell, from above) row 1 lies on.
 */
export type RowSide = "left" | "right";

export type GridFit = {
  origin: Vec3;
  rowStep: Vec3;
  colStep: Vec3;
  /** Distance between neighbouring rows / columns (mm). */
  rowPitch: number;
  colPitch: number;
  /** Angle between the row and column directions in XY (deg; 90 = square). */
  axisAngleDeg: number;
  /** Direction of the first row (cell (0,0) → (0,1)) in XY, from +X (deg). */
  rotationDeg: number;
  /** Highest minus lowest corner Z (mm) — how far the grid tilts end to end. */
  zSpanMm: number;
  /** 4-point: distance from each taught corner to the fitted grid (mm). */
  residuals?: Partial<Record<CornerKey, number>>;
  maxResidualMm?: number;
};

export type FitResult = { ok: true; fit: GridFit } | { ok: false; error: string };

/** Which cell each corner key stands for. */
export function cornerCell(key: CornerKey, rows: number, cols: number): { row: number; col: number } {
  switch (key) {
    case "A": return { row: 0, col: 0 };
    case "B": return { row: 0, col: cols - 1 };
    case "C": return { row: rows - 1, col: 0 };
    case "D": return { row: rows - 1, col: cols - 1 };
  }
}

/** The corners a method teaches, in teaching order. */
export function methodCorners(method: GridMethod): CornerKey[] {
  return method === "2pt" ? ["A", "D"] : method === "3pt" ? ["A", "B", "C"] : ["A", "B", "C", "D"];
}

/** Why the grid size can't be taught with this method, or null when it can. */
export function sizeProblem(method: GridMethod, rows: number, cols: number): string | null {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return "Enter the number of rows and columns";
  if (method === "2pt" && rows * cols < 2) return "A grid needs at least 2 cells";
  if (method !== "2pt" && (rows < 2 || cols < 2)) return "3- and 4-point teaching need at least 2 rows and 2 columns";
  return null;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const deg = (r: number) => (r * 180) / Math.PI;

/** Where the fitted grid puts a cell. */
export function cellPosition(fit: Pick<GridFit, "origin" | "rowStep" | "colStep">, row: number, col: number): Vec3 {
  return add(fit.origin, add(mul(fit.rowStep, row), mul(fit.colStep, col)));
}

function describe(origin: Vec3, rowStep: Vec3, colStep: Vec3, rows: number, cols: number): GridFit {
  const rowPitch = len(rowStep), colPitch = len(colStep);
  // Squareness in the work plane (XY); undefined with a single row or column.
  const rxy = Math.hypot(rowStep.x, rowStep.y), cxy = Math.hypot(colStep.x, colStep.y);
  const axisAngleDeg = rxy > 1e-9 && cxy > 1e-9
    ? deg(Math.acos(Math.max(-1, Math.min(1, (rowStep.x * colStep.x + rowStep.y * colStep.y) / (rxy * cxy)))))
    : 90;
  const dir = cols > 1 ? colStep : rowStep;
  const rotationDeg = deg(Math.atan2(dir.y, dir.x));
  const zs = (["A", "B", "C", "D"] as CornerKey[]).map(k => {
    const { row, col } = cornerCell(k, rows, cols);
    return cellPosition({ origin, rowStep, colStep }, row, col).z;
  });
  return { origin, rowStep, colStep, rowPitch, colPitch, axisAngleDeg, rotationDeg, zSpanMm: Math.max(...zs) - Math.min(...zs) };
}

const MIN_SPAN_MM = 0.5;

/**
 * Fit a grid from taught corners. `taught` holds the corners the method needs (see methodCorners);
 * `rowSide` picks the mirror image for 2-point teaching.
 */
export function fitGrid(
  method: GridMethod, rows: number, cols: number,
  taught: Partial<Record<CornerKey, Vec3>>, rowSide: RowSide = "left",
): FitResult {
  const bad = sizeProblem(method, rows, cols);
  if (bad) return { ok: false, error: bad };
  for (const k of methodCorners(method)) if (!taught[k]) return { ok: false, error: `Corner ${k} is not taught yet` };
  const n = rows - 1, m = cols - 1;

  if (method === "3pt") {
    const A = taught.A!, B = taught.B!, C = taught.C!;
    if (len(sub(B, A)) < MIN_SPAN_MM) return { ok: false, error: "The first row's two ends were taught at the same spot" };
    if (len(sub(C, A)) < MIN_SPAN_MM) return { ok: false, error: "The first column's two ends were taught at the same spot" };
    const colStep = mul(sub(B, A), 1 / m), rowStep = mul(sub(C, A), 1 / n);
    return { ok: true, fit: describe(A, rowStep, colStep, rows, cols) };
  }

  if (method === "4pt") {
    const A = taught.A!, B = taught.B!, C = taught.C!, D = taught.D!;
    // Least-squares step vectors with the origin FIXED at corner A, so the base point is exactly A
    // (no separate derived origin to store). Minimising |p−m·col|² + |q−n·row|² + |s−n·row−m·col|²
    // over the corner offsets p=B−A (down the first row), q=C−A (down the first column), s=D−A gives
    //   n·row = (2q + s − p)/3,   m·col = (2p − q + s)/3.
    const p = sub(B, A), q = sub(C, A), s = sub(D, A);
    if (len(p) < MIN_SPAN_MM || len(q) < MIN_SPAN_MM) return { ok: false, error: "Some corners were taught at the same spot" };
    const rowStep = mul(sub(add(mul(q, 2), s), p), 1 / (3 * n));   // (2q + s − p) / 3n
    const colStep = mul(add(sub(mul(p, 2), q), s), 1 / (3 * m));   // (2p − q + s) / 3m
    const fit = describe(A, rowStep, colStep, rows, cols);
    const residuals: Partial<Record<CornerKey, number>> = {};
    for (const k of ["A", "B", "C", "D"] as CornerKey[]) {
      const { row, col } = cornerCell(k, rows, cols);
      residuals[k] = len(sub(taught[k]!, cellPosition(fit, row, col)));
    }
    fit.residuals = residuals;
    fit.maxResidualMm = Math.max(...Object.values(residuals) as number[]);
    return { ok: true, fit };
  }

  // 2-point: A = cell(0,0), D = cell(R-1, C-1). Square pitch p, orthogonal row/col directions in XY:
  //   D - A = p·(n·r̂ + m·ĉ),  r̂ ⊥ ĉ  ⇒  p = |D-A|xy / √(n²+m²), and ĉ sits atan2(n, m) off the diagonal.
  const A = taught.A!, D = taught.D!;
  const d = sub(D, A);
  const dxy = Math.hypot(d.x, d.y);
  if (dxy < MIN_SPAN_MM) return { ok: false, error: "The two corners were taught at the same spot" };
  const p = dxy / Math.hypot(n, m);
  const s = rowSide === "left" ? 1 : -1;           // +1: row 1 is a CCW quarter-turn from the row direction
  const dAng = Math.atan2(d.y, d.x);
  const colAng = dAng - s * Math.atan2(n, m);
  const rowAng = colAng + s * (Math.PI / 2);
  // Spread the Z change over both directions in proportion to the cell counts (least-norm split).
  const k2 = n * n + m * m;
  const colStep = { x: p * Math.cos(colAng), y: p * Math.sin(colAng), z: m > 0 ? (d.z * m) / k2 : 0 };
  const rowStep = { x: p * Math.cos(rowAng), y: p * Math.sin(rowAng), z: n > 0 ? (d.z * n) / k2 : 0 };
  return { ok: true, fit: describe(A, rowStep, colStep, rows, cols) };
}

/**
 * Re-fit a saved grid from its taught corner points' CURRENT poses — the whole point of keeping the
 * corners: re-teaching or editing one recomputes the grid. `resolve` looks a corner reference up in the
 * live points (id-first). Returns null for a manual grid, a grid missing a corner, or one whose counts
 * are gone. The origin is always corner A, so only the row/column steps change — the base point, being
 * corner A itself, carries its own (possibly re-taught) pose.
 */
export type GridCornerRef = { role: CornerKey; pointId: string; pointName: string };

export function refitGrid(
  grid: {
    method?: GridMethod | "manual";
    corners?: GridCornerRef[];
    rowCount?: number;
    colCount?: number;
    rowSide?: RowSide;
  },
  resolve: (ref: GridCornerRef) => Pose | null,
): GridFit | null {
  if (!grid.method || grid.method === "manual") return null;
  const method = grid.method;
  const rows = grid.rowCount ?? 0, cols = grid.colCount ?? 0;
  const taught: Partial<Record<CornerKey, Pose>> = {};
  for (const k of methodCorners(method)) {
    const ref = grid.corners?.find(c => c.role === k);
    const pose = ref ? resolve(ref) : null;
    if (!pose) return null;
    taught[k] = pose;
  }
  const res = fitGrid(method, rows, cols, taught, grid.rowSide ?? "left");
  return res.ok ? res.fit : null;
}
