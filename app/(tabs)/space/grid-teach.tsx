import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { colors, PageHeader, Screen } from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import { spaceSets, SpacePreview3D } from "@/src/components/space/space3d";
import type { Cell3DPreview, Cell3DSet } from "@/src/components/ui/cell3d/bridge";
import { cellPosition, CornerKey, fitGrid, GridMethod, methodCorners, Pose, RowSide, sizeProblem } from "@/src/components/ui/grid/gridFit";
import { GridReviewStep, GridSetupStep, GridTeachCornerStep } from "@/src/components/ui/grid/GridTeachSteps";
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints, useRobotStatus, useStacks, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * Grid teaching wizard: Setup → one step per corner → Review & save. Turns 2, 3 or 4 taught
 * corners into a base point ("<name> origin") plus row/column steps (src/components/ui/grid/gridFit.ts).
 * Route param `id`: re-teach that existing grid (keeps its id, so Move steps that use it follow).
 * Route param `name`: pre-fills the name of a new grid (from the New Grid page).
 */
export default function GridTeachScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const grids = useGrids();
  const existing = id ? grids.find(g => g.id === id) ?? null : null;
  // Keyed on the grid so its name/size seed the form even when the grid list arrives late.
  return <GridTeachWizard key={existing?.id ?? "new"} existing={existing} initialName={name} />;
}

function GridTeachWizard({ existing, initialName }: { existing: Grid | null; initialName?: string }) {
  const grids  = useGrids();
  const points = usePoints();
  const tools  = useTools();
  const status = useRobotStatus();

  const [step, setStep]       = useState(0);
  const [name, setName]       = useState(existing?.name ?? initialName ?? "");
  const [rows, setRows]       = useState(existing?.rowCount != null ? String(existing.rowCount) : "8");
  const [cols, setCols]       = useState(existing?.colCount != null ? String(existing.colCount) : "8");
  const [method, setMethod]   = useState<GridMethod>(
    existing?.method && existing.method !== "manual" ? existing.method : "3pt");
  const [taught, setTaught]   = useState<Partial<Record<CornerKey, Pose>>>({});
  const [rowSide, setRowSide] = useState<RowSide>((existing?.rowSide as RowSide) ?? "left");
  // Each taught corner is saved as a named global point. Names default off the grid name (or keep the
  // grid's existing corner names when re-teaching); overrides stick once the user edits one.
  const [cornerNameOverride, setCornerNameOverride] = useState<Partial<Record<CornerKey, string>>>({});
  const [cornerDesc, setCornerDesc] = useState<Partial<Record<CornerKey, string>>>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);


  const r = Number(rows), c = Number(cols);
  const corners = methodCorners(method);
  const STEPS = useMemo(() => ["Setup", ...corners.map(k => `Corner ${k}`), "Review"], [method]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewIndex = corners.length + 1;

  const trimmed = name.trim();
  const nameTaken = grids.some(g => g.name.trim().toLowerCase() === trimmed.toLowerCase() && g.id !== existing?.id);

  // ── Per-corner point names/descriptions ──
  const roleWord: Record<CornerKey, string> = { A: "origin", B: "row end", C: "column end", D: "far corner" };
  const defaultCornerName = (k: CornerKey) =>
    existing?.corners?.find(cr => cr.role === k)?.pointName ?? `${trimmed || "Grid"} ${roleWord[k]}`;
  const cornerName = (k: CornerKey) => cornerNameOverride[k] ?? defaultCornerName(k);
  const cornerDescription = (k: CornerKey) =>
    cornerDesc[k] ?? (points.find(p => p.name === cornerName(k).trim())?.description ?? "");
  const cornerNameError = (k: CornerKey): string | undefined => {
    const nm = cornerName(k).trim();
    if (!nm) return "Name this point";
    const lower = nm.toLowerCase();
    if (corners.filter(j => cornerName(j).trim().toLowerCase() === lower).length > 1) return "Two corners share this name";
    return undefined;
  };
  // Corner names that already exist as points but aren't already this grid's corners (those get moved).
  const existingCornerNames = new Set((existing?.corners ?? []).map(cr => cr.pointName));
  const overwritesPoint = corners.some(k => {
    const nm = cornerName(k).trim();
    return points.some(p => p.name === nm) && !existingCornerNames.has(nm);
  });

  const result = useMemo(
    () => (corners.every(k => taught[k]) ? fitGrid(method, r, c, taught, rowSide) : null),
    [method, r, c, taught, rowSide], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 3D preview: the taught corners as marks, the fitted grid once every corner is in, and the
  // other saved grids / stacks for context.
  const stacks = useStacks();
  const teachSets = useMemo<Cell3DSet[]>(() => {
    const marks: Cell3DSet = {
      kind: "marks", id: "taught-corners",
      positions: corners.filter(k => taught[k]).map(k => ({ ...taught[k]!, name: k })),
    };
    return [marks, ...spaceSets(grids.filter(g => g.id !== existing?.id), stacks, points)];
  }, [taught, method, grids, stacks, points, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo<Cell3DPreview | null>(() => {
    if (!result?.ok) return null;
    const rows = Math.min(r, 50), cols = Math.min(c, 50);
    const positions = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) positions.push(cellPosition(result.fit, i, j));
    return { kind: "set", set: { kind: "grid", id: existing?.id || "draft", name: trimmed || "New grid", rows, cols, positions } };
  }, [result, r, c, existing?.id, trimmed]);

  // Highest step open right now: setup must be valid, then corners in order.
  const setupOk = trimmed.length > 0 && !nameTaken && !sizeProblem(method, r, c);
  let reachable = 0;
  if (setupOk) {
    reachable = 1;
    for (const k of corners) { if (!taught[k] || cornerNameError(k)) break; reachable++; }
  }
  const goto = (k: number) => setStep(Math.min(k, reachable));

  // A changed method or size invalidates nothing taught at A, but corners can mean other cells:
  // drop the ones the new layout doesn't use, and any taught for a different size.
  const changeMethod = (m: GridMethod) => {
    setMethod(m);
    setTaught(t => Object.fromEntries(Object.entries(t).filter(([k]) => methodCorners(m).includes(k as CornerKey))));
    setSaved(false);
  };
  const changeSize = (set: (v: string) => void) => (v: string) => {
    set(v);
    setTaught(t => (t.A ? { A: t.A } : {}));   // A is cell 1,1 at any size; the others move
    setSaved(false);
  };

  const teach = (k: CornerKey, pose: Pose) => { setTaught(t => ({ ...t, [k]: pose })); setSaved(false); };

  const save = async () => {
    if (!result?.ok) return;
    const { fit } = result;
    setSaving(true);
    setSaveError(null);
    try {
      const q = (v: number) => Math.round(v * 1e4) / 1e4;   // 0.1 µm: keeps the saved numbers readable
      // Save each taught corner as a named global point at its exact taught pose + description.
      // TeachPoint creates a point (keeping an existing one's id when re-teaching); EditPoint then
      // writes the precise coordinates (the live pose TeachPoint captured is discarded) and name/desc.
      for (const k of corners) {
        const nm = cornerName(k).trim();
        const pose = taught[k]!;
        const desc = (cornerDesc[k] ?? "").trim();
        if (!points.some(p => p.name === nm)) await robotClient.sendCommand("TeachPoint", { name: nm });
        await robotClient.editPoint(nm, {
          x: q(pose.x), y: q(pose.y), z: q(pose.z), rx: pose.rx, ry: pose.ry, rz: pose.rz,
          ...(desc ? { description: desc } : {}),
        });
      }
      // Corner refs — ids are backfilled from the live points on the grid page (points are keyed by
      // name on the controller, so a freshly-created corner's id arrives with the next broadcast).
      const cornerRefs = corners.map(k => {
        const nm = cornerName(k).trim();
        return { role: k, pointName: nm, pointId: points.find(p => p.name === nm)?.id ?? "" };
      });
      const baseName = cornerName("A").trim();
      await robotClient.saveGrid({
        id: existing?.id ?? "",
        name: trimmed,
        basePointName: baseName,                 // base point IS corner A (origin = A)
        basePointId: points.find(p => p.name === baseName)?.id ?? "",
        rowOffsetX: q(fit.rowStep.x), rowOffsetY: q(fit.rowStep.y), rowOffsetZ: q(fit.rowStep.z),
        colOffsetX: q(fit.colStep.x), colOffsetY: q(fit.colStep.y), colOffsetZ: q(fit.colStep.z),
        rowCount: r, colCount: c,
        rotation: 0,                             // the steps are already in the world frame
        method,
        rowSide: method === "2pt" ? rowSide : undefined,
        corners: cornerRefs,
        lastUpdatedUnixMs: 0,
      });
      setSaved(true);
    } catch (e: any) {
      setSaveError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const leave = (navigate: () => void) => {
    const unsaved = !saved && Object.keys(taught).length > 0;
    if (!unsaved) { navigate(); return; }
    appAlert("Leave grid teaching?", "The taught corners will be discarded and nothing is saved.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: navigate },
    ]);
  };
  const exit = () => leave(() => router.dismissTo("/space/grids"));

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <GridSetupStep
        name={name} onName={v => { setName(v); setSaved(false); }} nameTaken={nameTaken}
        rows={rows} onRows={changeSize(setRows)}
        cols={cols} onCols={changeSize(setCols)}
        method={method} onMethod={changeMethod}
        tools={tools} activeTool={status.activeTool}
        onToolChange={n => { robotClient.setActiveTool(n); }}
        onNext={() => goto(1)}
      />
    );
  } else if (step <= corners.length) {
    const k = corners[step - 1];
    const last = step === corners.length;
    body = (
      <GridTeachCornerStep
        key={k}
        corner={k} index={step - 1} total={corners.length}
        rows={r} cols={c} method={method} taught={taught}
        onTeach={teach}
        name={cornerName(k)}
        onName={v => { setCornerNameOverride(o => ({ ...o, [k]: v })); setSaved(false); }}
        nameError={cornerNameError(k)}
        description={cornerDescription(k)}
        onDescription={v => { setCornerDesc(d => ({ ...d, [k]: v })); setSaved(false); }}
        onBack={() => goto(step - 1)}
        onNext={() => goto(step + 1)}
        nextLabel={last ? "Next: Review" : `Next: Corner ${corners[step]}`}
      />
    );
  } else {
    body = (
      <GridReviewStep
        name={trimmed} rows={r} cols={c} method={method} taught={taught}
        fit={result?.ok ? result.fit : null}
        fitError={result && !result.ok ? result.error : null}
        rowSide={rowSide} onRowSide={s => { setRowSide(s); setSaved(false); }}
        overwritesPoint={overwritesPoint}
        saving={saving} saved={saved} saveError={saveError}
        onSave={save}
        onBack={() => goto(corners.length)}
        onDone={() => (router.canGoBack() ? router.back() : router.replace("/space/grids"))}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NotConnectedOverlay />
      <PageHeader
        title={existing ? `Teach ${existing.name}` : "Teach a grid"}
        subtitle="Jog to its corners; the cells in between are worked out"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Grids", href: "/space/grids" },
          { label: "Teach" },
        ]}
        onBack={exit}
        onNavigate={href => leave(() => router.navigate(href as never))}
      />
      <Screen>
        <WizardStepper steps={STEPS} current={step} reachable={Math.min(reachable, reviewIndex)} onStep={goto} />
        {body}
        {step > 0 && (
          <SpacePreview3D
            preview={preview}
            sets={teachSets}
            hint={preview ? undefined : "Taught corners appear here"}
          />
        )}
      </Screen>
    </View>
  );
}

