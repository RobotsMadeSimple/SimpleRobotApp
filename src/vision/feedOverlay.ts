// Builds the tool overlay the live feed draws (FEED_HTML's setOverlay in visionHtml.ts).
//
// With a result, a tool is drawn where it actually ran this frame (result.region, after its fixture
// moved it), coloured by status, with its found points, lines and pose and its grid cells pass/fail.
// Without one, each tool's configured region is drawn as stored — dashed when it follows a fixture,
// since a stored fixture region is in the fixture's reference space, not necessarily where it shows.
// A tool that shares another's area (regionFrom) is drawn on that tool's region.

import { TOOL_META, regionOwner, type ToolResult, type VisionProgram, type VisionResult, type VisionTool, type VPoint } from "@/src/models/visionTools";
import { gridCells, looksNormalized, regionOutlinePx } from "./regionMath";

type P = [number, number];

export type FeedOverlayItem = {
  id: string;
  label?: string;
  color: string;
  dim?: boolean;
  selected?: boolean;
  dashed?: boolean;
  /** Space of `outline` and `cells`: "norm" is scaled by the frame size in the canvas, "px" drawn as-is. */
  space: "px" | "norm";
  /** Size [w, h] of the frame the pixel coordinates are in — the live preview may be smaller. */
  frame?: P;
  outline?: P[] | null;
  cells?: { pts: P[]; passed: boolean | null }[];
  /** Points, lines and the pose are always pixels. */
  points?: P[];
  lines?: [number, number, number, number][];
  pose?: { x: number; y: number; angle: number } | null;
  /** Closed outlines in pixels — a matching tool's pattern placed at each match. */
  contours?: P[][];
  /** Text at a pixel point — e.g. a match's score beside it. */
  labels?: [number, number, string][];
};

export const STATUS_COLORS = {
  ok: "#22c55e",
  fail: "#ef4444",
  notRun: "#9ca3af",
  error: "#f97316",
  none: "#22d3ee",
} as const;

export function resultColor(r: ToolResult | undefined): string {
  if (!r) return STATUS_COLORS.none;
  if (r.status === "notRun") return STATUS_COLORS.notRun;
  if (r.status === "error") return STATUS_COLORS.error;
  return r.passed ? STATUS_COLORS.ok : STATUS_COLORS.fail;
}

const toP = (p: VPoint): P => [p.x, p.y];

export function buildOverlay(
  program: VisionProgram,
  result: VisionResult | null,
  opts: { width: number; height: number; selectedId?: string | null; only?: string[] },
): FeedOverlayItem[] {
  const W = opts.width || 640, H = opts.height || 480;
  const items: FeedOverlayItem[] = [];
  for (const tool of program.tools) {
    if (!tool.enabled) continue;
    if (opts.only && !opts.only.includes(tool.id)) continue;
    const r = result?.tools?.find(t => t.id === tool.id);
    const color = resultColor(r);
    const selected = opts.selectedId === tool.id;
    const dim = r?.status === "notRun" || (!!opts.selectedId && !selected);

    let outline: VPoint[] | null = null;
    let space: "px" | "norm" = "px";
    let dashed = false;
    if (r?.region && r.region.length >= 2) {
      outline = r.region;
      space = looksNormalized(r.region) ? "norm" : "px";
    } else {
      const owner = regionOwner(tool, program.tools);
      if (owner.region) {
        outline = regionOutlinePx(owner.region, W, H).map(p => ({ x: p.x / W, y: p.y / H }));
        space = "norm";
        dashed = !!owner.fixtureId;
      }
    }

    const grid = tool.grid && tool.grid.rows * tool.grid.cols > 1 && TOOL_META[tool.type].grid ? tool.grid : null;
    let cells: FeedOverlayItem["cells"];
    if (r?.cells?.length && r.cells.every(c => c.quad && c.quad.length >= 3)) {
      // The controller reports each measured cell window — draw exactly those.
      cells = r.cells.map(c => ({ pts: c.quad!.map(toP), passed: c.passed }));
      if (space === "norm") cells = cells.map(c => ({ ...c, pts: c.pts.map(([x, y]) => [x / W, y / H] as P) }));
    } else if (grid && outline) {
      const byIndex = new Map((r?.cells ?? []).map(c => [c.index, c.passed]));
      cells = gridCells(outline, grid.rows, grid.cols, grid.inset ?? 0)
        .map((pts, i) => ({ pts: pts.map(toP), passed: byIndex.has(i) ? !!byIndex.get(i) : null }));
    }

    items.push({
      id: tool.id,
      label: tool.name,
      color, dim, selected, dashed, space,
      outline: outline ? outline.map(toP) : null,
      cells,
      points: (r?.points ?? []).map(toP),
      lines: (r?.lines ?? []).map(l => [l.x1, l.y1, l.x2, l.y2] as [number, number, number, number]),
      pose: r?.pose ? { x: r.pose.x, y: r.pose.y, angle: r.pose.angle } : null,
      contours: (r?.contours ?? []).map(c => c.map(toP)),
      labels: r?.contours?.length ? matchLabels(r) : undefined,
    });

    // findCorner's second side, as configured (its used outline is not reported separately).
    const regionB = tool.type === "findCorner" ? (tool.params.regionB as VisionTool["region"]) : null;
    if (regionB && !(r && tool.fixtureId)) {
      items.push({
        id: tool.id + ":B", color, dim, selected, dashed: !!tool.fixtureId, space: "norm",
        outline: regionOutlinePx(regionB, W, H).map(p => [p.x / W, p.y / H] as P),
      });
    }
  }
  // Selected tool last, so it draws on top.
  return items.map(it => ({ ...it, frame: [W, H] as P })).sort((a, b) => Number(!!a.selected) - Number(!!b.selected));
}

/** Each match's score beside it (items with x, y and score), for tools that draw matched outlines. */
function matchLabels(r: ToolResult): [number, number, string][] {
  return (r.items ?? []).slice(0, 20).flatMap(it => {
    const x = Number(it.x), y = Number(it.y), sc = Number(it.score);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(sc) ? [[x, y, sc.toFixed(2)] as [number, number, string]] : [];
  });
}
