import React from "react";
import { Text, View } from "react-native";
import { Crosshair, Grid3x3, X } from "lucide-react-native";
import { ParamRow, SliderParamRow, ToggleRow } from "@/src/components/vision/VisionParams";
import {
  CornerInspection,
  EdgeInspection,
  FrameInspection,
  FrameResult,
  NormPoint,
  TextureInspection,
  VisionZone,
} from "@/src/models/robotModels";
import { Button, buttonTextColor, colors, SegmentedControl, spacing } from "@/src/components/ui/kit";
import { ves } from "./visionEditorStyles";

/**
 * Parameter panels for the frame (alignment), corner, edge and texture inspections. Each edits a
 * whole draft object; the config modal owns name/enabled/zone and merges them on save.
 */

const fmtPt = (p: NormPoint) => `${(p[0] * 100).toFixed(1)}%, ${(p[1] * 100).toFixed(1)}%`;
const CORNER_NAMES = ["TL", "TR", "BR", "BL"];

export function FramePanel({ draft, onChange, latest, isRunning, zones, searchZoneId, onSnapZone }: {
  draft: FrameInspection;
  onChange: (next: FrameInspection) => void;
  /** This inspection's FrameResult from the live result stream, if any. */
  latest: FrameResult | null;
  isRunning: boolean;
  zones: VisionZone[];
  /** The zone it searches (the modal's current pick — the draft's own zoneId may be stale). */
  searchZoneId: string | null;
  /** Copy the found corners into that zone as a Skewed zone (checker frames). */
  onSnapZone?: (zoneId: string, corners: NormPoint[]) => void;
}) {
  const set = (patch: Partial<FrameInspection>) => onChange({ ...draft, ...patch });
  const aligned = zones.filter(z => z.alignTo === draft.id);
  const canCapture = !!latest?.found && latest.corners.length === 4;
  const isChecker = draft.method === "checker";
  // A checker frame on a zone that is aligned to it: the controller snaps that zone onto the
  // squares directly — there is no reference to capture, only the drawn zone to tidy up.
  const selfZone = isChecker && searchZoneId ? aligned.find(z => z.id === searchZoneId) ?? null : null;
  return (
    <>
      <View style={ves.blobPanel}>
        <Text style={ves.blobPanelTitle}>Frame Detection</Text>
        <Text style={ves.paramDesc}>
          Finds the four corners of a frame — e.g. the board&apos;s outer edge, or a checkerboard&apos;s squares — and
          reports them TL, TR, BR, BL. Zones set to &quot;Align to&quot; this frame follow it every frame.
        </Text>
        <SegmentedControl
          size="sm"
          options={[
            { label: "Checker grid", value: "checker" },
            { label: "Outline", value: "contour" },
            { label: "Edges", value: "lines" },
            { label: "Corners", value: "corners" },
          ]}
          value={draft.method}
          onChange={m => set({ method: m })}
          style={{ marginVertical: spacing.sm }}
        />
        <Text style={ves.paramDesc}>
          {isChecker
            ? "Checker grid (recommended for a checkerboard): fits the grid to the board's squares. Draw the zone roughly over the 64 squares (within about a fifth of a square of each corner) and align that same zone to this frame — it then snaps onto the squares each frame and follows a nudged camera; no reference needed."
            : draft.method === "contour"
            ? "Outline: the largest 4-sided outline in the search area (Canny edges → contour → polygon). Needs the whole frame in view, contrasting with its surroundings and with nothing touching it."
            : draft.method === "lines"
            ? "Edges: straight edge lines in the two main directions (Hough lines), intersected. Tolerates one hidden corner (a hand or a piece over it), but long straight edges near the board — a table edge, wood grain — can mislead it."
            : "Corners: the outermost strong corner points (Shi-Tomasi). The steadiest choice for an outlined board (a frame on a plain surface): draw the search area snugly around the board."}
        </Text>

        {isChecker && (
          <>
            <ParamRow label="Rows" value={draft.gridRows ?? 8} min={2} max={32}
              onChange={v => set({ gridRows: Math.round(v) })}
              desc="Squares down the board" />
            <ParamRow label="Cols" value={draft.gridCols ?? 8} min={2} max={32}
              onChange={v => set({ gridCols: Math.round(v) })}
              desc="Squares across the board" />
            <ParamRow label="Min Edge Ratio" value={draft.minEdgeRatio ?? 4} min={1} max={50}
              onChange={v => set({ minEdgeRatio: v })}
              desc="Found when the grid lines carry this many times the edge strength of the square centres. A fitted board is about 8–18; a grid a quarter square off, or a hand over the board, is under 4." />
          </>
        )}
        {(draft.method === "contour" || draft.method === "lines") && (
          <>
            <SliderParamRow label="Canny Min" value={draft.cannyLow} min={0} max={255}
              onChange={v => set({ cannyLow: Math.round(v) })}
              desc="Lower edge threshold — higher finds fewer, stronger edges" />
            <SliderParamRow label="Canny Max" value={draft.cannyHigh} min={0} max={255}
              onChange={v => set({ cannyHigh: Math.round(v) })}
              desc="Upper edge threshold — usually 2–3× the lower one" />
          </>
        )}
        {draft.method === "contour" && (
          <>
            <SliderParamRow label="Min Area (%)" value={draft.minAreaPct} min={0} max={100}
              onChange={v => set({ minAreaPct: Math.round(v * 10) / 10 })}
              desc="Smallest frame, as % of the search area — raise it to ignore squares inside the board" />
            <SliderParamRow label="Epsilon" value={draft.approxEpsilon} min={0.001} max={0.2}
              onChange={v => set({ approxEpsilon: v })}
              desc="How loosely the outline may match 4 straight sides (fraction of the perimeter)" />
          </>
        )}
        {draft.method === "lines" && (
          <>
            <SliderParamRow label="Hough Threshold" value={draft.houghThreshold} min={1} max={255}
              onChange={v => set({ houghThreshold: Math.round(v) })}
              desc="Edge votes a line needs — higher keeps only strong, straight edges" />
            <SliderParamRow label="Min Length (%)" value={draft.minLineLengthPct} min={1} max={100}
              onChange={v => set({ minLineLengthPct: Math.round(v) })}
              desc="Shortest edge, as % of the search area's smaller side" />
            <ParamRow label="Max Gap (px)" value={draft.maxLineGap} min={0} max={9999}
              onChange={v => set({ maxLineGap: v })}
              desc="Largest break bridged within one edge (e.g. where a piece covers it)" />
          </>
        )}
        {draft.method === "corners" && (
          <>
            <ParamRow label="Max Corners" value={draft.maxCorners} min={4} max={2000}
              onChange={v => set({ maxCorners: Math.round(v) })}
              desc="Strongest corners considered" />
            <SliderParamRow label="Quality" value={draft.cornerQuality} min={0.001} max={0.5}
              onChange={v => set({ cornerQuality: v })}
              desc="Minimum corner strength relative to the strongest one" />
            <ParamRow label="Min Distance (px)" value={draft.minCornerDistance} min={1} max={9999}
              onChange={v => set({ minCornerDistance: v })}
              desc="Corners closer than this are merged" />
          </>
        )}
      </View>

      {latest?.score != null && (
        <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md }]}>
          {latest.found ? "Found" : "Not found"} · edge ratio {latest.score.toFixed(1)}
        </Text>
      )}

      {selfZone ? (
      <View style={ves.groupCard}>
        <Text style={ves.groupTitle}>SNAP TO SQUARES</Text>
        <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md }]}>
          &quot;{selfZone.name}&quot; is searched and aligned by this frame, so it is used exactly where the squares are
          found — no reference needed. Snap copies the found corners into the zone, so your rough drawing becomes
          the exact board and every frame starts from there.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingTop: spacing.sm }}>
          <Button
            label="Snap zone to squares"
            size="sm"
            icon={<Grid3x3 size={14} color={buttonTextColor("primary")} />}
            disabled={!canCapture || !onSnapZone}
            onPress={() => latest && onSnapZone?.(selfZone.id, latest.corners.map(p => [p[0], p[1]] as NormPoint))}
            style={{ flex: 1 }}
          />
        </View>
        {!canCapture && (
          <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
            {!isRunning ? "Start Vision to find the squares, then snap the zone here." : "The squares aren't being found yet — redraw the zone closer to the board's corners."}
          </Text>
        )}
      </View>
      ) : (
      <View style={ves.groupCard}>
        <Text style={ves.groupTitle}>ALIGNMENT REFERENCE</Text>
        <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md }]}>
          The frame&apos;s corners as they were when the zones were drawn. Each frame, aligned zones are moved by
          however far the frame has moved from here — so set it with the camera where you drew the zones.
        </Text>
        {draft.referenceCorners && draft.referenceCorners.length === 4 ? (
          <View style={{ paddingHorizontal: spacing.md, gap: 2 }}>
            {draft.referenceCorners.map((p, i) => (
              <Text key={i} style={{ fontSize: 12, color: colors.textSecondary, fontVariant: ["tabular-nums"] }}>
                {CORNER_NAMES[i]}  {fmtPt(p)}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={{ paddingHorizontal: spacing.md, fontSize: 13, color: colors.warning }}>
            No reference set — aligned zones are used as drawn until you set one.
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingTop: spacing.sm }}>
          <Button
            label="Use current detection"
            size="sm"
            icon={<Crosshair size={14} color={buttonTextColor("primary")} />}
            disabled={!canCapture}
            onPress={() => latest && set({ referenceCorners: latest.corners.map(p => [p[0], p[1]] as NormPoint) })}
            style={{ flex: 1 }}
          />
          {!!draft.referenceCorners && (
            <Button
              label="Clear"
              size="sm"
              variant="secondary"
              icon={<X size={14} color={buttonTextColor("secondary")} />}
              onPress={() => set({ referenceCorners: null })}
            />
          )}
        </View>
        {!canCapture && (
          <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md, paddingBottom: spacing.sm }]}>
            {!isRunning ? "Start Vision to detect the frame, then capture it here." : "The frame isn't being found yet — adjust the settings above until it is."}
          </Text>
        )}
        <Text style={[ves.paramDesc, { paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
          {aligned.length === 0
            ? "No zone is aligned to this frame yet — set a zone's \"Align to\" in the zone list."
            : `Aligns: ${aligned.map(z => z.name).join(", ")}`}
        </Text>
      </View>
      )}
    </>
  );
}

export function CornerPanel({ draft, onChange }: { draft: CornerInspection; onChange: (next: CornerInspection) => void }) {
  const set = (patch: Partial<CornerInspection>) => onChange({ ...draft, ...patch });
  return (
    <View style={ves.blobPanel}>
      <Text style={ves.blobPanelTitle}>Corner Detection</Text>
      <SegmentedControl
        size="sm"
        options={[{ label: "Shi-Tomasi", value: "shiTomasi" }, { label: "Harris", value: "harris" }]}
        value={draft.method}
        onChange={m => set({ method: m })}
        style={{ marginVertical: spacing.sm }}
      />
      <ParamRow label="Max Corners" value={draft.maxCorners} min={1} max={2000}
        onChange={v => set({ maxCorners: Math.round(v) })}
        desc="Strongest corners kept, best first" />
      <SliderParamRow label="Quality" value={draft.quality} min={0.001} max={0.5}
        onChange={v => set({ quality: v })}
        desc="Minimum strength relative to the strongest corner — raise it to keep only sharp corners" />
      <ParamRow label="Min Distance (px)" value={draft.minDistance} min={1} max={9999}
        onChange={v => set({ minDistance: v })}
        desc="Corners closer than this count once" />
      <SliderParamRow label="Block Size" value={draft.blockSize} min={2} max={31}
        onChange={v => set({ blockSize: Math.round(v) })}
        desc="Neighbourhood each corner is measured over (px)" />
      <ParamRow label="Min Count" value={draft.minCount} min={0} max={9999}
        onChange={v => set({ minCount: Math.round(v) })}
        desc="Found when at least this many corners are detected" />
    </View>
  );
}

export function EdgePanel({ draft, onChange }: { draft: EdgeInspection; onChange: (next: EdgeInspection) => void }) {
  const set = (patch: Partial<EdgeInspection>) => onChange({ ...draft, ...patch });
  return (
    <View style={ves.blobPanel}>
      <Text style={ves.blobPanelTitle}>Edge Detection</Text>
      <SliderParamRow label="Canny Min" value={draft.cannyLow} min={0} max={255}
        onChange={v => set({ cannyLow: Math.round(v) })}
        desc="Lower edge threshold — higher finds fewer, stronger edges" />
      <SliderParamRow label="Canny Max" value={draft.cannyHigh} min={0} max={255}
        onChange={v => set({ cannyHigh: Math.round(v) })}
        desc="Upper edge threshold — usually 2–3× the lower one" />
      <SliderParamRow label="Min Density (%)" value={draft.minDensity} min={0} max={100}
        onChange={v => set({ minDensity: Math.round(v * 10) / 10 })}
        desc="Passes when at least this % of the zone is edges" />
      <ToggleRow
        label="Max Density"
        value={draft.maxDensity !== null}
        onChange={on => set({ maxDensity: on ? 50 : null })}
        desc="Also fail when the zone is too busy"
      />
      {draft.maxDensity !== null && (
        <SliderParamRow label="Max Density (%)" value={draft.maxDensity} min={0} max={100}
          onChange={v => set({ maxDensity: Math.round(v * 10) / 10 })}
          desc="…and at most this % (e.g. to tell a clear area from a cluttered one)" />
      )}
    </View>
  );
}

export function TexturePanel({ draft, onChange }: { draft: TextureInspection; onChange: (next: TextureInspection) => void }) {
  const set = (patch: Partial<TextureInspection>) => onChange({ ...draft, ...patch });
  return (
    <View style={ves.blobPanel}>
      <Text style={ves.blobPanelTitle}>Texture</Text>
      <Text style={ves.paramDesc}>
        Scores fine detail — on a grid zone, per cell. Each cell is scored on its centre only. On real photos black
        checkers scored 6.5+, empty squares under 3.
      </Text>
      <SliderParamRow label="Cell Inset (%)" value={draft.cellInset} min={0} max={45}
        onChange={v => set({ cellInset: Math.round(v) })}
        desc="Trimmed off each side of a cell before scoring, so its borders and a slightly-off grid don't count" />
      <ToggleRow
        label="Min Score"
        value={draft.minScore !== null}
        onChange={on => set({ minScore: on ? 4 : null })}
        desc="Pass when the detail is at least this much"
      />
      {draft.minScore !== null && (
        <ParamRow label="Min Score" value={draft.minScore} min={0} max={255}
          onChange={v => set({ minScore: v })}
          desc="e.g. 4 for checkers: a ringed piece scores well above, a plain square well below" />
      )}
      <ToggleRow
        label="Max Score"
        value={draft.maxScore !== null}
        onChange={on => set({ maxScore: on ? 20 : null })}
        desc="Also fail when the detail is too high"
      />
      {draft.maxScore !== null && (
        <ParamRow label="Max Score" value={draft.maxScore} min={0} max={255}
          onChange={v => set({ maxScore: v })}
          desc="…and at most this (e.g. to pass only plain, empty cells)" />
      )}
    </View>
  );
}
