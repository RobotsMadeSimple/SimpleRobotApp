import { subscribeRobot } from "@/src/connections/robotState";
import { Point, RobotInfo, RobotStatus, createDefaultStatus } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type RobotWithStatus = RobotInfo & {
  status: RobotStatus;
};

type RobotContextType = {
  robots: RobotWithStatus[];
  connected: boolean;
  selectedRobot: RobotWithStatus | null;
  points: Point[];
};

const RobotContext = createContext<RobotContextType>({
  robots: [],
  connected: false,
  selectedRobot: null,
  points: [],
});

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [status, setStatus] = useState<RobotStatus>(createDefaultStatus());
  const [points, setPoints] = useState<Point[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  useEffect(() => {
    const unsubDiscovery = robotDiscovery.subscribe(setRobots);
    const unsubStatus = robotClient.onStatus(setStatus);
    const unsubPoints = robotClient.onPoints(setPoints);
    const unsubSelected = subscribeRobot(robot =>
      setSelectedSerial(robot?.serialNumber ?? null)
    );

    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubDiscovery();
      unsubStatus();
      unsubSelected();
      unsubPoints();
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
    <RobotContext.Provider value={{ robots: robotsWithStatus, connected: status.connected, selectedRobot, points}}>
      {children}
    </RobotContext.Provider>
  );
}

export function useRobots() {
  return useContext(RobotContext);
}

export function usePoints(){
  return useContext(RobotContext).points;
}

export function useSelectedRobot() {
  return useContext(RobotContext).selectedRobot;
}
