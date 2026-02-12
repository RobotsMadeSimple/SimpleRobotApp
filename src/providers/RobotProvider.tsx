import { subscribeRobot } from "@/src/connections/robotState";
import { RobotInfo, RobotStatus } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type RobotWithStatus = RobotInfo & {
  status: RobotStatus;
};

type RobotContextType = {
  robots: RobotWithStatus[];
  selectedRobot: RobotWithStatus | null;
};

const defaultStatus: RobotStatus = {
  connected: false,
  moving: false,
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  targetRx: 0,
  targetRy: 0,
  targetRz: 0,
  poseX: 0,
  poseY: 0,
  poseZ: 0,
  poseRx: 0,
  poseRy: 0,
  poseRz: 0,
  speedS: 0,
  accelS: 0,
  decelS: 0,
  speedJ: 0,
  accelJ: 0,
  decelJ: 0,
};

const RobotContext = createContext<RobotContextType>({
  robots: [],
  selectedRobot: null,
});

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [status, setStatus] = useState<RobotStatus>(defaultStatus);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  useEffect(() => {
    const unsubDiscovery = robotDiscovery.subscribe(setRobots);
    const unsubStatus = robotClient.onStatus(setStatus);
    const unsubSelected = subscribeRobot(robot =>
      setSelectedSerial(robot?.serialNumber ?? null)
    );

    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubDiscovery();
      unsubStatus();
      unsubSelected();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, []);

  const robotsWithStatus: RobotWithStatus[] = useMemo(
    () =>
      robots.map(r => ({
        ...r,
        status,
      })),
    [robots, status]
  );

  const selectedRobot = useMemo(
    () =>
      robotsWithStatus.find(r => r.serialNumber === selectedSerial) ?? null,
    [robotsWithStatus, selectedSerial]
  );

  return (
    <RobotContext.Provider value={{ robots: robotsWithStatus, selectedRobot }}>
      {children}
    </RobotContext.Provider>
  );
}

export function useRobots() {
  return useContext(RobotContext);
}

export function useSelectedRobot() {
  return useContext(RobotContext).selectedRobot;
}
