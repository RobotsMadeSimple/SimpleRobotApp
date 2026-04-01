import { subscribeRobot } from "@/src/connections/robotState";
import { BuiltProgram, NanoState, Point, ProgramSummary, Tool, RobotInfo, RobotStatus, createDefaultStatus } from "@/src/models/robotModels";
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
  tools: Tool[];
  builtPrograms: BuiltProgram[];
  programSummaries: ProgramSummary[];
  status: RobotStatus;
  nanoIO: NanoState[];
};

const RobotContext = createContext<RobotContextType>({
  robots: [],
  connected: false,
  selectedRobot: null,
  points: [],
  tools: [],
  builtPrograms: [],
  programSummaries: [],
  status: createDefaultStatus(),
  nanoIO: [],
});

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [robots,         setRobots]        = useState<RobotInfo[]>([]);
  const [status,         setStatus]        = useState<RobotStatus>(createDefaultStatus());
  const [points,         setPoints]        = useState<Point[]>([]);
  const [tools,          setTools]         = useState<Tool[]>([]);
  const [builtPrograms,  setBuiltPrograms] = useState<BuiltProgram[]>([]);
  const [nanoIO,         setNanoIO]        = useState<NanoState[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  useEffect(() => {
    const unsubDiscovery     = robotDiscovery.subscribe(setRobots);
    const unsubStatus        = robotClient.onStatus(setStatus);
    const unsubPoints        = robotClient.onPoints(setPoints);
    const unsubTools         = robotClient.onTools(setTools);
    const unsubBuiltPrograms = robotClient.onBuiltPrograms(setBuiltPrograms);
    const unsubNanoIO        = robotClient.onNanoIO(setNanoIO);
    const unsubSelected      = subscribeRobot(robot =>
      setSelectedSerial(robot?.serialNumber ?? null)
    );

    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubDiscovery();
      unsubStatus();
      unsubSelected();
      unsubPoints();
      unsubTools();
      unsubBuiltPrograms();
      unsubNanoIO();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, []);

  const robotsWithStatus: RobotWithStatus[] = useMemo(
    () => robots.map(r => ({ ...r, status })),
    [robots, status]
  );

  const selectedRobot = useMemo(
    () => robotsWithStatus.find(r => r.serialNumber === selectedSerial) ?? null,
    [robotsWithStatus, selectedSerial]
  );

  return (
    <RobotContext.Provider value={{
      robots: robotsWithStatus,
      connected: status.connected,
      selectedRobot,
      points,
      tools,
      builtPrograms,
      programSummaries: status.programs,
      status,
      nanoIO,
    }}>
      {children}
    </RobotContext.Provider>
  );
}

export function useRobots() {
  return useContext(RobotContext);
}

export function usePoints() {
  return useContext(RobotContext).points;
}

export function useTools() {
  return useContext(RobotContext).tools;
}

export function useBuiltPrograms() {
  return useContext(RobotContext).builtPrograms;
}

export function useProgramSummaries() {
  return useContext(RobotContext).programSummaries;
}

export function useSelectedRobot() {
  return useContext(RobotContext).selectedRobot;
}

export function useConnected() {
  return useContext(RobotContext).connected;
}

export function useRobotStatus() {
  return useContext(RobotContext).status;
}

export function useNanoIO() {
  return useContext(RobotContext).nanoIO;
}
