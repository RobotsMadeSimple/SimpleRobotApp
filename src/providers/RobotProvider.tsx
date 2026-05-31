import { subscribeRobot } from "@/src/connections/robotState";
import { BuiltProgram, Grid, NanoState, Point, ProgramSummary, Tool, RobotInfo, RobotStatus, UsbRelayState, createDefaultStatus } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type RobotWithStatus = RobotInfo & { status: RobotStatus };

// ── Status context — updates every poll tick (100 ms) ─────────────────────────

type StatusContextType = {
  connected:        boolean;
  status:           RobotStatus;
  programSummaries: ProgramSummary[];
  robots:           RobotWithStatus[];
  selectedRobot:    RobotWithStatus | null;
};

const StatusContext = createContext<StatusContextType>({
  connected:        false,
  status:           createDefaultStatus(),
  programSummaries: [],
  robots:           [],
  selectedRobot:    null,
});

// ── Data context — updates only when repository data changes ─────────────────

type DataContextType = {
  points:              Point[];
  tools:               Tool[];
  builtPrograms:       BuiltProgram[];
  builtProgramsLoaded: boolean;
  nanoIO:              NanoState[];
  relayIO:             UsbRelayState | null;
  grids:               Grid[];
};

const DataContext = createContext<DataContextType>({
  points:              [],
  tools:               [],
  builtPrograms:       [],
  builtProgramsLoaded: false,
  nanoIO:              [],
  relayIO:             null,
  grids:               [],
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [robots,              setRobots]              = useState<RobotInfo[]>([]);
  const [status,              setStatus]              = useState<RobotStatus>(createDefaultStatus());
  const [points,              setPoints]              = useState<Point[]>([]);
  const [tools,               setTools]               = useState<Tool[]>([]);
  const [builtPrograms,       setBuiltPrograms]       = useState<BuiltProgram[]>([]);
  const [builtProgramsLoaded, setBuiltProgramsLoaded] = useState(false);
  const [nanoIO,              setNanoIO]              = useState<NanoState[]>([]);
  const [relayIO,             setRelayIO]             = useState<UsbRelayState | null>(null);
  const [grids,               setGrids]               = useState<Grid[]>([]);
  const [selectedRobotInfo,   setSelectedRobotInfo]   = useState<RobotInfo | null>(null);

  useEffect(() => {
    const unsubDiscovery     = robotDiscovery.subscribe(setRobots);
    const unsubStatus        = robotClient.onStatus(setStatus);
    const unsubPoints        = robotClient.onPoints(setPoints);
    const unsubTools         = robotClient.onTools(setTools);
    const unsubBuiltPrograms = robotClient.onBuiltPrograms(programs => {
      setBuiltPrograms(programs);
      setBuiltProgramsLoaded(true);
    });
    const unsubNanoIO   = robotClient.onNanoIO(setNanoIO);
    const unsubRelayIO  = robotClient.onRelayIO(setRelayIO);
    const unsubGrids    = robotClient.onGrids(setGrids);
    const unsubSelected = subscribeRobot(robot => setSelectedRobotInfo(robot));

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
      unsubRelayIO();
      unsubGrids();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, []);

  // ── Status context value ─────────────────────────────────────────────────

  const robotsWithStatus = useMemo<RobotWithStatus[]>(
    () => robots.map(r => ({ ...r, status })),
    [robots, status]
  );

  const selectedRobot = useMemo<RobotWithStatus | null>(() => {
    if (!selectedRobotInfo) return null;
    if (selectedRobotInfo.serialNumber) {
      return robotsWithStatus.find(r => r.serialNumber === selectedRobotInfo.serialNumber)
        ?? { ...selectedRobotInfo, status };
    }
    return { ...selectedRobotInfo, status };
  }, [selectedRobotInfo, robotsWithStatus, status]);

  const statusContextValue = useMemo<StatusContextType>(() => ({
    connected:        status.connected,
    status,
    programSummaries: status.programs,
    robots:           robotsWithStatus,
    selectedRobot,
  }), [status, robotsWithStatus, selectedRobot]);

  // ── Data context value ───────────────────────────────────────────────────

  const dataContextValue = useMemo<DataContextType>(() => ({
    points,
    tools,
    builtPrograms,
    builtProgramsLoaded,
    nanoIO,
    relayIO,
    grids,
  }), [points, tools, builtPrograms, builtProgramsLoaded, nanoIO, relayIO, grids]);

  return (
    <StatusContext.Provider value={statusContextValue}>
      <DataContext.Provider value={dataContextValue}>
        {children}
      </DataContext.Provider>
    </StatusContext.Provider>
  );
}

// ── Hooks — status (re-renders on every poll tick) ────────────────────────────

export function useRobots()          { return useContext(StatusContext).robots; }
export function useSelectedRobot()   { return useContext(StatusContext).selectedRobot; }
export function useConnected()       { return useContext(StatusContext).connected; }
export function useRobotStatus()     { return useContext(StatusContext).status; }
export function useProgramSummaries(){ return useContext(StatusContext).programSummaries; }

// ── Hooks — data (re-renders only when repository data changes) ───────────────

export function usePoints()              { return useContext(DataContext).points; }
export function useTools()               { return useContext(DataContext).tools; }
export function useBuiltPrograms()       { return useContext(DataContext).builtPrograms; }
export function useBuiltProgramsLoaded() { return useContext(DataContext).builtProgramsLoaded; }
export function useNanoIO()              { return useContext(DataContext).nanoIO; }
export function useRelayIO()             { return useContext(DataContext).relayIO; }
export function useGrids()               { return useContext(DataContext).grids; }
