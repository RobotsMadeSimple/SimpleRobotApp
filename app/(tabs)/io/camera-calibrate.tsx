import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { colors, PageHeader, Screen } from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DetectStep } from "@/src/components/ui/calibration/DetectStep";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { DotPolarity, parsePitch, SetupStep } from "@/src/components/ui/calibration/SetupStep";
import { SolveStep } from "@/src/components/ui/calibration/SolveStep";
import { TeachStep } from "@/src/components/ui/calibration/TeachStep";
import { useCalibrationSession } from "@/src/components/ui/calibration/useCalibrationSession";
import { useCameraCalibration } from "@/src/components/ui/calibration/useCameraCalibration";
import { VerifyStep } from "@/src/components/ui/calibration/VerifyStep";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import { CalibrationDot } from "@/src/models/robotModels";
import { useCameras, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

const STEPS = ["Setup", "Detect", "Teach", "Solve", "Verify"] as const;

/**
 * Camera-to-robot calibration wizard (docs/camera-calibration.md › App wizard).
 * Route param: cameraId. The controller session lives in useCalibrationSession and
 * is discarded when this screen unmounts, so leaving early never leaves one behind.
 */
export default function CameraCalibrateScreen() {
  const { cameraId = "" } = useLocalSearchParams<{ cameraId?: string }>();
  const cameras = useCameras();
  const tools   = useTools();
  const status  = useRobotStatus();
  const camera  = cameras.find(c => c.id === cameraId);
  const existing = useCameraCalibration(cameraId, camera?.calibrated).calibration;
  const cal = useCalibrationSession(cameraId);

  const [step, setStep]         = useState(0);
  const [pitch, setPitch]       = useState("");
  const [polarity, setPolarity] = useState<DotPolarity>("dark");
  const [selected, setSelected] = useState<CalibrationDot | null>(null);
  const [pitchUsed, setPitchUsed] = useState<number | null>(null);

  useEffect(() => { robotClient.getCameras().catch(() => {}); }, []);
  // Recalibrating: start from the pitch used last time.
  useEffect(() => {
    if (existing && pitch === "") setPitch(String(existing.dotPitchMm));
  }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const imageUri = useMemo(() => {
    const url = cal.session ? robotClient.calibrationImageUrl(cal.session.imageUrl) : null;
    return url ? `${url}${url.includes("?") ? "&" : "?"}v=${cal.frame}` : null;
  }, [cal.session, cal.frame]);

  const taughtIndices = useMemo(() => new Set(cal.taught.map(t => t.dotIndex)), [cal.taught]);

  const detect = async () => {
    const p = parsePitch(pitch);
    if (!p) { setStep(0); return; }
    // The pitch is fixed per session (only CalibrationStart takes it): a new pitch starts over.
    if (cal.session && pitchUsed !== p) cal.restart();
    setPitchUsed(p);
    setStep(1);
    const s = await cal.detect(p, { darkDots: polarity === "dark" });
    if (s) setSelected(prev => (prev ? s.dots.find(d => d.i === prev.i && d.j === prev.j) ?? null : null));
  };

  const reachable =
    cal.solved ? 4
    : cal.taught.length >= 2 ? 3
    : cal.session?.dots.length ? 2
    : cal.session || step >= 1 ? 1
    : 0;

  const goto = (k: number) => { cal.clearProblem(); setStep(Math.min(k, reachable)); };

  const leave = (navigate: () => void) => {
    const unsavedWork = !!cal.session && !cal.saved && cal.taught.length > 0;
    if (!unsavedWork) { navigate(); return; }
    appAlert("Leave calibration?", "The taught dots will be discarded and nothing is saved.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: navigate },
    ]);
  };
  const exit = () => leave(() => (router.canGoBack() ? router.back() : router.replace("/io")));

  const setTool = (name: string) => { robotClient.setActiveTool(name); };

  let body: React.ReactNode = null;
  if (step === 0) {
    body = (
      <SetupStep
        camera={camera}
        existing={existing}
        pitch={pitch}
        onPitchChange={setPitch}
        polarity={polarity}
        onPolarityChange={setPolarity}
        tools={tools}
        activeTool={status.activeTool}
        onToolChange={setTool}
        detecting={cal.busy === "detect"}
        onDetect={detect}
      />
    );
  } else if (step === 1 || !cal.session) {
    body = (
      <DetectStep
        session={cal.session}
        imageUri={imageUri}
        selected={selected}
        onSelect={setSelected}
        taughtIndices={taughtIndices}
        detecting={cal.busy === "detect"}
        problem={cal.problem}
        onRedetect={detect}
        onBack={() => goto(0)}
        onNext={() => goto(2)}
      />
    );
  } else if (step === 2) {
    body = (
      <TeachStep
        session={cal.session}
        imageUri={imageUri}
        selected={selected}
        onSelect={setSelected}
        taught={cal.taught}
        busy={cal.busy === "teach"}
        problem={cal.problem}
        onTeach={cal.teach}
        onUnteach={cal.unteach}
        onBack={() => goto(1)}
        onNext={() => goto(3)}
      />
    );
  } else if (step === 3) {
    body = (
      <SolveStep
        taught={cal.taught}
        result={cal.solved}
        saved={cal.saved}
        solving={cal.busy === "solve"}
        problem={cal.problem}
        onSolve={cal.solve}
        onBack={() => goto(2)}
        onNext={() => goto(4)}
      />
    );
  } else {
    body = (
      <VerifyStep
        session={cal.session}
        imageUri={imageUri}
        saved={cal.saved}
        calibrationTool={cal.solved?.calibration.activeTool ?? ""}
        predicting={cal.busy === "predict"}
        problem={cal.problem}
        predict={cal.predict}
        onBack={() => goto(3)}
        onDone={() => (router.canGoBack() ? router.back() : router.replace("/io"))}
      />
    );
  }

  const cameraLabel = camera?.name ?? cameraId;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NotConnectedOverlay />
      <PageHeader
        title="Calibrate camera"
        subtitle={`${cameraLabel} → robot coordinates`}
        crumbs={[
          { label: "I/O", href: "/io" },
          { label: cameraLabel, href: `/(tabs)/io/cameras?cameraId=${encodeURIComponent(cameraId)}` },
          { label: "Calibrate" },
        ]}
        onBack={exit}
        onNavigate={href => leave(() => router.navigate(href as never))}
      />
      <Screen>
        <WizardStepper steps={STEPS} current={step} reachable={reachable} onStep={goto} />
        {cal.problem?.code === "unsupported" ? (
          <Notice tone="danger" title={cal.problem.title}>{cal.problem.detail}</Notice>
        ) : body}
      </Screen>
    </View>
  );
}
