import React from "react";
import { Text, View } from "react-native";
import { Crosshair, X } from "lucide-react-native";
import { ParamRow, SliderParamRow, ToggleRow } from "@/src/components/vision/VisionParams";
import {
  CornerInspection,
  EdgeInspection,
  FrameInspection,
  FrameResult,
  NormPoint,
  VisionZone,
} from "@/src/models/robotModels";
import { Button, buttonTextColor, colors, SegmentedControl, spacing } from "@/src/components/ui/kit";
import { ves } from "./visionEditorStyles";

/**
 * Parameter panels for the frame (alignment), corner and edge inspections. Each edits a
 * whole draft object; the config modal owns name/enabled/zone and merges them on save.
 */

const fmtPt = (p: NormPoint) => `${(p[0] * 100).toFixed(1)}%, ${(p[1] * 100).toFixed(1)}%`;
const CORNER_NAMES = ["TL", "TR", "BR", "BL"];

export function FramePanel({ draft, onChange, latest, isRunning, zones }: {
  draft: FrameInspection;
  onChange: (next: FrameInspection) => void;
  /** This inspection's FrameResult from the live result stream, if any. */
  latest: FrameResult | null;
  isRunning: boolean;
  zones: VisionZone[];
}) {
  const set = (patch: Partial<FrameInspection>) => onChange({ ...draft, ...patch });
  const aligned = zones.filter(z => z.alignTo === draft.id);
  const canCapture = !!latest?.found && latest.corners.length === 4;
  return (
    <>
      <View style={ves.blobPanel}>
        <Text style={ves.blobPanelTitle}>Frame Detection</Text>
        <Text style={ves.paramDesc}>
          Finds the four corners of a frame — e.g. the board&apos;s outer edge — and reports them TL, TR, BR, BL.
          Zones set to &quot;Align to&quot; this frame follow it every frame.
        </Text>
        <SegmentedControl
          size="sm"
          options={[
            { label: "Outline", value: "contour" },
            { label: "Edges", value: "lines" },
            { label: "Corners", value: "corners" },
          ]}
          value={draft.method}
          onChange={m => set({ method: m })}
          style={{ marginVertical: spacing.sm }}
        />
        <Text style={ves.paramDesc}>
          {draft.method === "contour"
            ? "Outline: the largest 4-sided outline in the search area (Canny edges → contour → polygon). Best when the frame contrasts with its surroundings."
            : draft.method === "lines"
            ? "Edges: the two outermost straight edges in each of the two main directions (Hough lines), intersected. Still works when a corner is hidden — by a hand reaching in or a piece on it — or rounded, so it's the most robust choice during play."
            : "Corners: the four outermost strong corner points (Shi-Tomasi). For a frame drawn by its corners, e.g. corner marks or posts."}
        </Text>

        {draft.method !== "corners" && (
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
