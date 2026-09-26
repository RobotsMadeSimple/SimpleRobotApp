import { robotClient } from "@/src/services/RobotConnectService";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { CartesianJogPanel, CartesianAxis } from "@/src/components/ui/jog/CartesianJogPanel";
import { JointJogPanel, JointAxis } from "@/src/components/ui/jog/JointJogPanel";

// ── Speed map ─────────────────────────────────────────────────────────────────
// "mm" entries are step-move magnitudes; others are continuous speeds (mm/s or °/s)

const DEFAULT_SPEEDS = { Slow: 10, Normal: 100, Fast: 300 };

// Jog keep-alive cadence. The controller runs a continuous velocity profile with
// a ~1s watchdog (JoggingMotionProfiler.resetTime), so each jog command is just a
// heartbeat that refreshes it — not a discrete move. 150ms keeps a ~6x safety
// margin while cutting jog traffic ~85% vs the old 20ms firehose, which used to
// leave StopJog stuck behind a congested socket over WiFi (laggy start/stop).
export const JOG_HEARTBEAT_MS = 150;

function buildSpeedMap(overrides?: { Slow: number; Normal: number; Fast: number }): Record<string, number> {
  const s = overrides ?? DEFAULT_SPEEDS;
  return {
    "0.1mm": 0.1,
    "1mm":   1,
    "10mm":  10,
    Slow:    s.Slow,
    Normal:  s.Normal,
    Fast:    s.Fast,
  };
}

// Joint degree-step equivalents for the discrete "mm" speed options
const jointStepMap: Record<string, number> = {
  "0.1mm": 0.5,
  "1mm":   2,
  "10mm":  10,
};

type JogPadProps = {
  jogMode:        string;  // "XYZ" | "Tool" | "Joint"
  selectedSpeed:  string;
  speedOverrides?: { Slow: number; Normal: number; Fast: number };
};

/**
 * Smart jog-pad container.
 * Handles all interval timing and robot commands; delegates visual layout
 * to CartesianJogPanel (XYZ / Tool) or JointJogPanel (Joint).
 */
export default function JogPad({ jogMode, selectedSpeed, speedOverrides }: JogPadProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedMap    = buildSpeedMap(speedOverrides);
  const activeSpeed = speedMap[selectedSpeed];
  const isStep      = selectedSpeed.includes("mm");

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stopJog = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    robotClient.stopJog();
  }, []);

  // Stop when the user navigates away from this screen
  useFocusEffect(useCallback(() => () => stopJog(), [stopJog]));

  // Stop when the app goes to background or becomes inactive
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") stopJog();
    });
    return () => { sub.remove(); stopJog(); };
  }, [stopJog]);

  // ── Cartesian start (XYZ / Tool) ────────────────────────────────────────────
  const startCartesian = (axis: CartesianAxis, direction: 1 | -1) => {
    if (intervalRef.current) return;

    const vec = {
      x:  axis === "x"  ? direction : 0,
      y:  axis === "y"  ? direction : 0,
      z:  axis === "z"  ? direction : 0,
      rz: axis === "rz" ? direction : 0,
    };

    if (jogMode === "Tool") {
      const tick = () => robotClient.jogTool({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      tick(); // fire immediately so the move starts on press, not after one interval
      intervalRef.current = setInterval(tick, JOG_HEARTBEAT_MS);
      return;
    }

    if (isStep) {
      robotClient.offsetL({
        x:  vec.x  * activeSpeed,
        y:  vec.y  * activeSpeed,
        z:  vec.z  * activeSpeed,
        rz: vec.rz * activeSpeed,
        speed: 100, accel: 200, decel: 1000,
      });
    } else {
      const tick = () => robotClient.jogL({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      tick(); // fire immediately so the move starts on press, not after one interval
      intervalRef.current = setInterval(tick, JOG_HEARTBEAT_MS);
    }
  };

  // ── Joint start ─────────────────────────────────────────────────────────────
  const startJoint = (joint: JointAxis, direction: 1 | -1) => {
    if (intervalRef.current) return;

    const vec = {
      x:  joint === "j1" ? direction : 0,
      y:  joint === "j3" ? direction : 0,
      z:  joint === "j2" ? direction : 0,
      rz: joint === "j4" ? direction : 0,
    };

    if (isStep) {
      const stepDeg = jointStepMap[selectedSpeed] ?? 2;
      robotClient.jogJ({
        x:  vec.x  * stepDeg,
        y:  vec.y  * stepDeg,
        z:  vec.z  * stepDeg,
        rz: vec.rz * stepDeg,
        speed: 20, accel: 100, decel: 200,
      });
    } else {
      const tick = () => robotClient.jogJ({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      tick(); // fire immediately so the move starts on press, not after one interval
      intervalRef.current = setInterval(tick, JOG_HEARTBEAT_MS);
    }
  };

  // ── Render the appropriate panel ────────────────────────────────────────────
  if (jogMode === "Joint") {
    return <JointJogPanel onStart={startJoint} onStop={stopJog} />;
  }

  return <CartesianJogPanel onStart={startCartesian} onStop={stopJog} />;
}
