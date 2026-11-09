import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { colors, PageHeader, Screen } from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import { CornerKey, fitGrid, GridMethod, methodCorners, Pose, RowSide, sizeProblem } from "@/src/components/ui/grid/gridFit";
import { GridReviewStep, GridSetupStep, GridTeachCornerStep } from "@/src/components/ui/grid/GridTeachSteps";
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
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
  const [method, setMethod]   = useState<GridMethod>("3pt");
  const [taught, setTaught]   = useState<Partial<Record<CornerKey, Pose>>>({});
  const [rowSide, setRowSide] = useState<RowSide>("left");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);


  const r = Number(rows), c = Number(cols);
  const corners = methodCorners(method);
  const STEPS = useMemo(() => ["Setup", ...corners.map(k => `Corner ${k}`), "Review"], [method]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewIndex = corners.length + 1;

  const trimmed = name.trim();
  const nameTaken = grids.some(g => g.name.trim().toLowerCase() === trimmed.toLowerCase() && g.id !== existing?.id);
  const originName = `${trimmed} origin`;
  const overwritesPoint = points.some(p => p.name === originName) && existing?.basePointName !== originName;

  const result = useMemo(
    () => (corners.every(k => taught[k]) ? fitGrid(method, r, c, taught, rowSide) : null),
    [method, r, c, taught, rowSide], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Highest step open right now: setup must be valid, then corners in order.
  const setupOk = trimmed.length > 0 && !nameTaken && !sizeProblem(method, r, c);
  let reachable = 0;
  if (setupOk) {
    reachable = 1;
    for (const k of corners) { if (!taught[k]) break; reachable++; }
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
      // The base point: cell (0,0) of the fit, with corner A's orientation. TeachPoint creates it
      // (or keeps its id when re-teaching), then EditPoint writes the exact coordinates.
      const A = taught.A!;
      const q = (v: number) => Math.round(v * 1e4) / 1e4;   // 0.1 µm: keeps the saved numbers readable
      if (!points.some(p => p.name === originName)) await robotClient.sendCommand("TeachPoint", { name: originName });
      await robotClient.editPoint(originName, {
        x: q(fit.origin.x), y: q(fit.origin.y), z: q(fit.origin.z), rx: A.rx, ry: A.ry, rz: A.rz,
      });
      await robotClient.saveGrid({
        id: existing?.id ?? "",
        name: trimmed,
        basePointName: originName,
        rowOffsetX: q(fit.rowStep.x), rowOffsetY: q(fit.rowStep.y), rowOffsetZ: q(fit.rowStep.z),
        colOffsetX: q(fit.colStep.x), colOffsetY: q(fit.colStep.y), colOffsetZ: q(fit.colStep.z),
        rowCount: r, colCount: c,
        rotation: 0,                          // the steps are already in the world frame
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
      </Screen>
    </View>
  );
}

