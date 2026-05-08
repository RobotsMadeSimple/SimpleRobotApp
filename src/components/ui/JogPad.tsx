import { robotClient } from "@/src/services/RobotConnectService";
import { useRef } from "react";
import { CartesianJogPanel, CartesianAxis } from "@/src/components/ui/jog/CartesianJogPanel";
import { JointJogPanel, JointAxis } from "@/src/components/ui/jog/JointJogPanel";

// ── Speed map ─────────────────────────────────────────────────────────────────
// "mm" entries are step-move magnitudes; others are continuous speeds (mm/s or °/s)

const speedMap: Record<string, number> = {
  "0.1mm": 0.1,
  "1mm":   1,
  "10mm":  10,
  Slow:    10,
  Normal:  100,
  Fast:    300,
};

// Joint degree-step equivalents for the discrete "mm" speed options
const jointStepMap: Record<string, number> = {
  "0.1mm": 0.5,
  "1mm":   2,
  "10mm":  10,
};

type JogPadProps = {
  jogMode:       string;  // "XYZ" | "Tool" | "Joint"
  selectedSpeed: string;
};

/**
 * Smart jog-pad container.
 * Handles all interval timing and robot commands; delegates visual layout
 * to CartesianJogPanel (XYZ / Tool) or JointJogPanel (Joint).
 *
 * Adding a new robot type's jog layout is as simple as creating a new
 * *JogPanel component and wiring it in here.
 */
export default function JogPad({ jogMode, selectedSpeed }: JogPadProps) {
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSpeed  = speedMap[selectedSpeed];
  const isStep       = selectedSpeed.includes("mm");

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stopJog = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    robotClient.stopJog();
  };

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
      intervalRef.current = setInterval(() => {
        robotClient.jogTool({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      }, 20);
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
      intervalRef.current = setInterval(() => {
        robotClient.jogL({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      }, 20);
    }
  };

  // ── Joint start ─────────────────────────────────────────────────────────────
  const startJoint = (joint: JointAxis, direction: 1 | -1) => {
    if (intervalRef.current) return;

    // Map joint key → jogJ axis param
    const vec = {
      x:  joint === "j1" ? direction : 0,
      y:  joint === "j2" ? direction : 0,
      z:  joint === "j3" ? direction : 0,
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
      intervalRef.current = setInterval(() => {
        robotClient.jogJ({ ...vec, speed: activeSpeed, accel: 200, decel: 1000 });
      }, 20);
    }
  };

  // ── Render the appropriate panel ────────────────────────────────────────────
  if (jogMode === "Joint") {
    return <JointJogPanel onStart={startJoint} onStop={stopJog} />;
  }

  return <CartesianJogPanel onStart={startCartesian} onStop={stopJog} />;
}
