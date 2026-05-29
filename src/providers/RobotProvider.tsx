import { subscribeRobot } from "@/src/connections/robotState";
import { BuiltProgram, Grid, NanoState, Point, ProgramSummary, Tool, RobotInfo, RobotStatus, UsbRelayState, createDefaultStatus } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { RobotSnapshot, RobotSnapshotService } from "@/src/services/RobotSnapshotService";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

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
  snapshot:            RobotSnapshot | null;
};

const DataContext = createContext<DataContextType>({
  points:              [],
  tools:               [],
  builtPrograms:       [],
  builtProgramsLoaded: false,
  nanoIO:              [],
  relayIO:             null,
  grids:               [],
  snapshot:            null,
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

  // ── Snapshot state ────────────────────────────────────────────────────────
  const [snapshot,      setSnapshot]      = useState<RobotSnapshot | null>(null);
  const lastSerialRef                     = useRef<string | null>(null);
  const savedFingerprintRef               = useRef<string>('');

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

  // Track the serial number of the last robot we connected to
  useEffect(() => {
    if (status.connected && selectedRobotInfo?.serialNumber) {
      lastSerialRef.current = selectedRobotInfo.serialNumber;
    }
  }, [status.connected, selectedRobotInfo]);

  // Auto-save snapshot whenever connected data changes (debounced 1s)
  useEffect(() => {
    if (!status.connected || !builtProgramsLoaded) return;
    const serial = lastSerialRef.current ?? selectedRobotInfo?.serialNumber;
    if (!serial) return;

    // Fingerprint prevents saving identical snapshots on every render
    const fp = `${serial}_${status.lastBuiltProgramUpdate}_${status.lastPointUpdate}_${status.lastToolUpdate}_${status.lastGridUpdate}`;
    if (fp === savedFingerprintRef.current) return;

    const timer = setTimeout(() => {
      savedFingerprintRef.current = fp;
      const snap: RobotSnapshot = {
        robotSerial: serial,
        robotName:   selectedRobotInfo?.robotName ?? '',
        savedAt:     Date.now(),
        programs:    builtPrograms.filter(p => !p.isRoutine),
        routines:    builtPrograms.filter(p =>  p.isRoutine),
        tools,
        grids,
        points,
      };
      RobotSnapshotService.save(snap);
      setSnapshot(snap);
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    status.connected,
    builtProgramsLoaded,
    status.lastBuiltProgramUpdate,
    status.lastPointUpdate,
    status.lastToolUpdate,
    status.lastGridUpdate,
  ]);

  // Load snapshot from storage when offline so pickers keep working
  useEffect(() => {
    if (status.connected) {
      setSnapshot(null);
      return;
    }
    const serial = lastSerialRef.current;
    if (!serial) return;
    RobotSnapshotService.load(serial).then(snap => {
      if (snap) setSnapshot(snap);
    });
  }, [status.connected]);

  // ── Effective data: live when connected, snapshot fallback when offline ───
  const isOffline = !status.connected;
  const effectivePoints   = isOffline && snapshot ? snapshot.points   : points;
  const effectiveTools    = isOffline && snapshot ? snapshot.tools    : tools;
  const effectiveGrids    = isOffline && snapshot ? snapshot.grids    : grids;
  const effectivePrograms = isOffline && snapshot
    ? [...snapshot.programs, ...snapshot.routines]
    : builtPrograms;
  const effectiveLoaded   = isOffline && snapshot ? true : builtProgramsLoaded;

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
    points:              effectivePoints,
    tools:               effectiveTools,
    builtPrograms:       effectivePrograms,
    builtProgramsLoaded: effectiveLoaded,
    nanoIO,
    relayIO,
    grids:               effectiveGrids,
    snapshot,
  }), [effectivePoints, effectiveTools, effectivePrograms, effectiveLoaded, nanoIO, relayIO, effectiveGrids, snapshot]);

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
export function useSnapshot()            { return useContext(DataContext).snapshot; }
