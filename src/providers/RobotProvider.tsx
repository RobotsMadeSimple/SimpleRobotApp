import { subscribeRobot } from "@/src/connections/robotState";
import { BuiltProgram, CameraState, Conveyor, ConveyorStatus, Grid, Local, IoDeviceState, Point, ProgramSummary, RobotStack, SerialDeviceState, Tool, RobotInfo, RobotStatus, UsbRelayState, createDefaultStatus } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { useIsFocused } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";

type RobotWithStatus = RobotInfo & { status: RobotStatus };

// ── Stores ────────────────────────────────────────────────────────────────────
// The connection's values live in two small external stores (not React state/context), so an
// update only re-renders the components that read the slice that changed — see useSlice below.

/** How often a screen that isn't focused hears about changes (all such screens together, once). */
const BACKGROUND_MS = 1000;

/**
 * A snapshot store: `get()` is stable until something changes. Live listeners hear every change;
 * background listeners hear at most one batched notice per BACKGROUND_MS, always ending on the
 * latest value.
 */
class Store<T> {
  protected snap: T;
  private live = new Set<() => void>();
  private background = new Set<() => void>();
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(initial: T) { this.snap = initial; }
  get = () => this.snap;
  subscribe = (l: () => void) => { this.live.add(l); return () => { this.live.delete(l); }; };
  subscribeBackground = (l: () => void) => { this.background.add(l); return () => { this.background.delete(l); }; };
  protected publish(next: T) {
    this.snap = next;
    this.live.forEach(l => l());
    if (this.background.size && !this.backgroundTimer) {
      this.backgroundTimer = setTimeout(() => {
        this.backgroundTimer = null;
        this.background.forEach(l => l());
      }, BACKGROUND_MS);
    }
  }
}

// ── Status store — updates every poll tick (100 ms) ───────────────────────────

type StatusContextType = {
  connected:        boolean;
  status:           RobotStatus;
  programSummaries: ProgramSummary[];
  robots:           RobotWithStatus[];
  selectedRobot:    RobotWithStatus | null;
};

/** Status, discovered robots and the selected robot (each robot carries the live status). */
class StatusStore extends Store<StatusContextType> {
  private robots: RobotInfo[] = [];
  private status: RobotStatus = createDefaultStatus();
  private selectedInfo: RobotInfo | null = null;

  constructor() {
    const status = createDefaultStatus();
    super({ connected: status.connected, status, programSummaries: status.programs, robots: [], selectedRobot: null });
    this.status = status;
  }

  setRobots   = (r: RobotInfo[])      => { if (r !== this.robots)       { this.robots = r;       this.rebuild(); } };
  setStatus   = (s: RobotStatus)      => { if (s !== this.status)       { this.status = s;       this.rebuild(); } };
  setSelected = (r: RobotInfo | null) => { if (r !== this.selectedInfo) { this.selectedInfo = r; this.rebuild(); } };

  private rebuild() {
    const status = this.status;
    const robots: RobotWithStatus[] = this.robots.map(r => ({ ...r, status }));
    const sel = this.selectedInfo;
    let selectedRobot: RobotWithStatus | null = null;
    if (sel) {
      selectedRobot = sel.serialNumber
        ? robots.find(r => r.serialNumber === sel.serialNumber) ?? { ...sel, status }
        : { ...sel, status };
    }
    this.publish({ connected: status.connected, status, programSummaries: status.programs, robots, selectedRobot });
  }
}

// ── Data store — updates only when repository data changes ────────────────────
// (ioDevices / relayIO can change every poll too: a streaming load cell or phone sensor.)

type DataContextType = {
  points:              Point[];
  tools:               Tool[];
  locals:              Local[];
  builtPrograms:       BuiltProgram[];
  builtProgramsLoaded: boolean;
  ioDevices:              IoDeviceState[];
  serialDevices:       SerialDeviceState[];
  relayIO:             UsbRelayState | null;
  grids:               Grid[];
  stacks:              RobotStack[];
  cameras:             CameraState[];
  conveyors:           Conveyor[];
  /** null until the controller has answered GetConveyors; false on one without conveyor tracking. */
  conveyorsSupported:  boolean | null;
  /** Live conveyor state from the status poll (changes up to 10× a second while a belt runs). */
  conveyorStatus:      ConveyorStatus[];
};

class DataStore extends Store<DataContextType> {
  constructor() {
    super({
      points:              [],
      tools:               [],
      locals:              [],
      builtPrograms:       [],
      builtProgramsLoaded: false,
      ioDevices:              [],
      serialDevices:       [],
      relayIO:             null,
      grids:               [],
      stacks:              [],
      cameras:             [],
      conveyors:           [],
      conveyorsSupported:  null,
      conveyorStatus:      [],
    });
  }
  set(patch: Partial<DataContextType>) {
    const cur = this.snap;
    if ((Object.keys(patch) as (keyof DataContextType)[]).every(k => cur[k] === patch[k])) return;
    this.publish({ ...cur, ...patch });
  }
}

const StatusStoreContext = createContext<StatusStore>(new StatusStore());
const DataStoreContext = createContext<DataStore>(new DataStore());

// ── Provider ──────────────────────────────────────────────────────────────────

export function RobotProvider({ children }: { children: React.ReactNode }) {
  // One pair of stores per provider. The provider itself never re-renders on an update.
  const [statusStore] = useState(() => new StatusStore());
  const [dataStore]   = useState(() => new DataStore());

  useEffect(() => {
    const unsubDiscovery     = robotDiscovery.subscribe(statusStore.setRobots);
    const unsubStatus        = robotClient.onStatus(statusStore.setStatus);
    const unsubPoints        = robotClient.onPoints(points => dataStore.set({ points }));
    const unsubTools         = robotClient.onTools(tools => dataStore.set({ tools }));
    const unsubLocals        = robotClient.onLocals(locals => dataStore.set({ locals }));
    const unsubBuiltPrograms = robotClient.onBuiltPrograms(programs => {
      dataStore.set({ builtPrograms: programs, builtProgramsLoaded: true });
    });
    const unsubIoDevices   = robotClient.onIoDevices(ioDevices => dataStore.set({ ioDevices }));
    const unsubSerialDevices = robotClient.onSerialDevices(serialDevices => dataStore.set({ serialDevices }));
    const unsubRelayIO  = robotClient.onRelayIO(relayIO => dataStore.set({ relayIO }));
    const unsubGrids    = robotClient.onGrids(grids => dataStore.set({ grids }));
    const unsubStacks   = robotClient.onStacks(stacks => dataStore.set({ stacks }));
    const unsubCameras  = robotClient.onCameras(cameras => dataStore.set({ cameras }));
    const unsubConveyors = robotClient.onConveyors(c => dataStore.set({ conveyors: c.conveyors, conveyorsSupported: c.supported }));
    const unsubConveyorStatus = robotClient.onConveyorStatus(conveyorStatus => dataStore.set({ conveyorStatus }));
    const unsubSelected = subscribeRobot(robot => statusStore.setSelected(robot));

    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubDiscovery();
      unsubStatus();
      unsubSelected();
      unsubPoints();
      unsubTools();
      unsubLocals();
      unsubBuiltPrograms();
      unsubIoDevices();
      unsubSerialDevices();
      unsubRelayIO();
      unsubGrids();
      unsubStacks();
      unsubCameras();
      unsubConveyors();
      unsubConveyorStatus();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, [statusStore, dataStore]);

  return (
    <StatusStoreContext.Provider value={statusStore}>
      <DataStoreContext.Provider value={dataStore}>
        {children}
      </DataStoreContext.Provider>
    </StatusStoreContext.Provider>
  );
}

// ── Subscription ──────────────────────────────────────────────────────────────
// Each hook re-renders only when its own slice changes (useConnected only when the connection
// flips, not on every tick). A screen that isn't focused (a tab in the background, a page under
// the one on top of its stack) still follows along, but once a second instead of on every poll,
// and catches up the moment it's focused again: mounted-but-hidden screens used to re-render 10×
// a second, which made navigating lag more with every tab visited. Outside a screen (root
// overlays, the nav rail) it's always live.

function useSlice<S, T>(store: Store<S>, pick: (s: S) => T): T {
  const live = useIsFocused();
  const subscribe = useCallback(
    (onChange: () => void) => (live ? store.subscribe(onChange) : store.subscribeBackground(onChange)),
    [store, live],
  );
  const getSnapshot = () => pick(store.get());
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const useStatusSlice = <T,>(pick: (s: StatusContextType) => T) => useSlice(useContext(StatusStoreContext), pick);
const useDataSlice   = <T,>(pick: (s: DataContextType) => T)   => useSlice(useContext(DataStoreContext), pick);

// ── Hooks — status (poll-rate values) ─────────────────────────────────────────

export function useRobots()          { return useStatusSlice(s => s.robots); }
export function useSelectedRobot()   { return useStatusSlice(s => s.selectedRobot); }
/** Just the selected robot's name (the whole selected robot changes with every status tick). */
export function useSelectedRobotName() { return useStatusSlice(s => s.selectedRobot?.robotName); }
export function useConnected()       { return useStatusSlice(s => s.connected); }
export function useRobotStatus()     { return useStatusSlice(s => s.status); }
export function useProgramSummaries(){ return useStatusSlice(s => s.programSummaries); }
/** One value from the status (e.g. `s => s.driverConnected`): re-renders only when it changes.
 *  The pick must return a primitive or an existing object, not a new one each call. */
export function useRobotStatusValue<T>(pick: (s: RobotStatus) => T) { return useStatusSlice(s => pick(s.status)); }

// ── Hooks — data (re-renders only when that data changes) ─────────────────────

export function usePoints()              { return useDataSlice(s => s.points); }
export function useTools()               { return useDataSlice(s => s.tools); }
export function useLocals()              { return useDataSlice(s => s.locals); }
export function useBuiltPrograms()       { return useDataSlice(s => s.builtPrograms); }
export function useBuiltProgramsLoaded() { return useDataSlice(s => s.builtProgramsLoaded); }
export function useIoDevices()           { return useDataSlice(s => s.ioDevices); }
export function useSerialDevices()        { return useDataSlice(s => s.serialDevices); }
/** One serial device by id (re-renders only when that device's entry changes). */
export function useSerialDevice(id: string | null | undefined) {
  return useDataSlice(s => (id ? s.serialDevices.find(d => d.id === id) ?? null : null));
}
export function useRelayIO()             { return useDataSlice(s => s.relayIO); }
export function useGrids()               { return useDataSlice(s => s.grids); }
export function useStacks()              { return useDataSlice(s => s.stacks); }
export function useCameras()             { return useDataSlice(s => s.cameras); }
export function useConveyors()           { return useDataSlice(s => s.conveyors); }
export function useConveyorsSupported()  { return useDataSlice(s => s.conveyorsSupported); }
export function useConveyorStatuses()    { return useDataSlice(s => s.conveyorStatus); }
/** One conveyor's live state (re-renders only when that conveyor's entry changes). */
export function useConveyorStatus(id: string | null | undefined) {
  return useDataSlice(s => (id ? s.conveyorStatus.find(c => c.id === id) ?? null : null));
}
