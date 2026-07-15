import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "../connections/robotState";
import { AuxDeviceState, BuiltProgram, CameraState, Grid, Local, NanoState, NeoPixelColor, Point, ProgramStatus, RobotInfo, RobotStack, RobotStatus, Tool, UsbRelayState, VisionProgram, VisionResult, createDefaultStatus } from "../models/robotModels";
type MessageHandler<T = any>  = (data: T) => void;
type StatusListener           = (status: RobotStatus)                    => void;
type PointsListener           = (points: Point[])                        => void;
type ToolsListener            = (tools: Tool[])                          => void;
type LocalsListener           = (locals: Local[])                        => void;
type BuiltProgramsListener    = (programs: BuiltProgram[])               => void;
type NanoIOListener           = (nanos: NanoState[])                     => void;
type RelayIOListener          = (relay: UsbRelayState | null)            => void;
type AuxAxisListener          = (aux: AuxDeviceState[])                  => void;
type CamerasListener          = (cameras: CameraState[])                 => void;
type ProgramImagesListener    = (images: Record<string, string | null>)  => void;
type GridsListener            = (grids: Grid[])                          => void;
type StacksListener           = (stacks: RobotStack[])                   => void;
type PendingAck = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type MoveParams = {
  x?: number
  y?: number
  z?: number
  rz?: number
  speed?: number
  accel?: number
  decel?: number
}

// ---------------------------------------------------------------------------
// Generic pub/sub topic — lightweight alternative to per-topic listener arrays.
// Listeners are stored in a Set (deduplicates accidental double-subscriptions).
// on() returns an unsubscribe function; emit() broadcasts the current value.
// ---------------------------------------------------------------------------
function createTopic<T>() {
  const listeners = new Set<(v: T) => void>();
  return {
    listeners,
    on(cb: (v: T) => void): () => void {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    emit(v: T): void { listeners.forEach(cb => cb(v)); },
  };
}

export class RobotConnectService {
  private statusListeners:        StatusListener[]        = [];
  // Topics created via createTopic<T>() — replaces per-topic listener arrays
  private readonly pointsTopic        = createTopic<Point[]>();
  private readonly toolsTopic         = createTopic<Tool[]>();
  private readonly localsTopic        = createTopic<Local[]>();
  private readonly builtProgramsTopic = createTopic<BuiltProgram[]>();
  private readonly nanoIOTopic        = createTopic<NanoState[]>();
  private readonly relayIOTopic       = createTopic<UsbRelayState | null>();
  private readonly auxAxisTopic       = createTopic<AuxDeviceState[]>();
  private readonly camerasTopic       = createTopic<CameraState[]>();
  private readonly programImagesTopic = createTopic<Record<string, string | null>>();
  private readonly gridsTopic         = createTopic<Grid[]>();
  private readonly stacksTopic        = createTopic<RobotStack[]>();
  private status:       RobotStatus        = createDefaultStatus();
  private connecting:   boolean            = false;
  private points:       Point[]            = [];
  private tools:        Tool[]             = [];
  private locals:       Local[]            = [];
  private builtPrograms:  BuiltProgram[]                = [];
  private nanoIO:         NanoState[]                   = [];
  private relayIO:        UsbRelayState | null          = null;
  private auxAxis:        AuxDeviceState[]              = [];
  private cameras:        CameraState[]                 = [];
  private programImages:  Record<string, string | null> = {};
  private grids:          Grid[]                        = [];
  private stacks:         RobotStack[]                  = [];

  private ws: WebSocket | null = null;
  private url?: string;
  private reconnect: boolean;
  private reconnectIntervalMs: number;
  private unsubscribe?: () => void;

  private messageHandlers: MessageHandler[] = [];
  private get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  private statusInterval: any = null;

  private pendingAcks = new Map<string, PendingAck>();

  constructor() {
    this.reconnect = true;
    this.reconnectIntervalMs = 1000;
  }

  // -------------------------
  // Connection management
  // -------------------------
  start() {
    this.unsubscribe = subscribeRobot(robot => {
      if (!robot) return;
      this.url = `ws://${robot.ipAddress}:${robot.port}/control`;
      console.log("Found Robot ip and port, updated the url point: ", this.url);
    })
  }

  connectTo(robot: RobotInfo) {
    this.url = `ws://${robot.ipAddress}:${robot.port}/control`;

    // Disconnect from any existing connections
    this.disconnect();

    // Allow the connection to reconnect if it drops
    this.reconnect = true;

    // Start connecting to the new address
    this.connect();
  }

  connect() {
    // Validate there is a url
    if (!this.url) return;

    // Already a websocket connected need to close it first to reconnect
    if (this.ws && this.connected) return;

    // Be paitent if the websocket is in the middle of connecting
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Avoid double connections
    if (this.connecting)
      return;

    console.log("[RobotWS] Connecting to", this.url);
    this.ws = new WebSocket(this.url);
    this.connecting = true;

    this.ws.onopen = () => {
      this.connecting = false;
      console.log("[RobotWS] Connected");
      this.emitStatus({ connected: true });
      this.startStatusPolling();
      // Eagerly load all repositories on connect so initial data is available
      // regardless of whether lastXxxUpdate timestamps have changed.
      this.getPoints().catch(() => {});
      this.getTools().catch(() => {});
      this.getLocals().catch(() => {});
      this.getBuiltPrograms().catch(() => {});
      this.getGrids().catch(() => {});
      this.getStacks().catch(() => {});
      this.getIO().catch(() => {});
      this.getAuxState().catch(() => {});
      this.getRobotInfo().then((info: any) => {
        const selected = getSelectedRobot();
        if (!selected) return;
        setSelectedRobot({
          ...selected,
          robotName:    info.robotName    || selected.robotName,
          robotType:    info.robotType    || selected.robotType,
          serialNumber: info.serialNumber || selected.serialNumber,
        });
      }).catch(() => {});
    };

    this.ws.onclose = () => {
      console.log("[RobotWS] Disconnected");
      this.emitStatus({ connected: false });

      this.cleanup();

      if (this.reconnect) {
        setTimeout(() => this.connect(), this.reconnectIntervalMs);
      }
    };

    this.ws.onerror = (err) => {
      console.warn("[RobotWS] Error", err);
    };

    this.ws.onmessage = (event) => {
      let data: any;

      try {
        data = JSON.parse(event.data);
      } catch {
        console.warn("[RobotWS] Invalid JSON:", event.data);
        return;
      }

      // Handle ACKs internally
      if (data?.type === "ack" && typeof data.id === "string") {
        this.decodeCommand(data);
      }
  
      // Forward everything else
      this.messageHandlers.forEach((cb) => cb(data));
    };
  }

  decodeCommand(data: any){
    const pending = this.pendingAcks.get(data.id);

    if (!pending)
      return;

    switch (data.command){
      case "GetStatus":
        if (typeof data.programs === "string") {
          try { data.programs = JSON.parse(data.programs); } catch { data.programs = []; }
        }
        if (!Array.isArray(data.programs)) {
          data.programs = [];
        }
        if (typeof data.backgroundPrograms === "string") {
          try { data.backgroundPrograms = JSON.parse(data.backgroundPrograms); } catch { data.backgroundPrograms = []; }
        }
        if (!Array.isArray(data.backgroundPrograms)) {
          data.backgroundPrograms = [];
        }
        this.emitStatus(data);
        break;
      
      case "GetPoints":
        console.log("GetPoints Decode");
        this.decodePoints(data);
        break;

      case "GetTools":
        this.decodeTools(data);
        break;

      case "GetLocals":
        this.decodeLocals(data);
        break;

      case "GetBuiltPrograms":
        this.decodeBuiltPrograms(data);
        break;

      case "GetGrids":
        this.decodeGrids(data);
        break;

      case "GetStacks":
        this.decodeStacks(data);
        break;

      case "GetIO":
        this.decodeIO(data);
        break;

      case "GetAuxState":
        this.decodeAuxState(data);
        break;

      case "GetCameras":
        this.decodeCameras(data);
        break;
    }

    this.pendingAcks.delete(data.id);
    pending.resolve(data);
  }

  private decodeAuxState(data: any) {
    if (!data.state) { this.auxAxis = []; this.emitAuxAxis(); return; }
    try {
      const parsed = JSON.parse(data.state);
      this.auxAxis = Array.isArray(parsed) ? (parsed as AuxDeviceState[]) : [];
    } catch {
      this.auxAxis = [];
    }
    this.emitAuxAxis();
  }

  private decodeCameras(data: any) {
    if (!data.cameras) { this.cameras = []; this.emitCameras(); return; }
    try {
      const parsed = JSON.parse(data.cameras);
      this.cameras = Array.isArray(parsed) ? (parsed as CameraState[]) : [];
    } catch {
      this.cameras = [];
    }
    this.emitCameras();
  }

  private decodeIO(data: any) {
    // Nano devices
    if (!data.nanos) {
      this.nanoIO = [];
    } else {
      try {
        const parsed = JSON.parse(data.nanos);
        this.nanoIO = Array.isArray(parsed) ? (parsed as NanoState[]) : [];
      } catch {
        this.nanoIO = [];
      }
    }
    this.emitNanoIO();

    // USB relay board
    if (!data.relay) {
      this.relayIO = null;
    } else {
      try {
        const parsed = JSON.parse(data.relay);
        this.relayIO = parsed as UsbRelayState;
      } catch {
        this.relayIO = null;
      }
    }
    this.emitRelayIO();
  }

  private decodePoints(data: any) {
    if (!data.points) { this.points = []; this.emitPoints(); return; }

    let parsed: any[];

    try {
      parsed = JSON.parse(data.points);
    } catch {
      console.warn("[RobotWS] Failed to parse points JSON");
      this.points = [];
      this.emitPoints();
      return;
    }

    if (!Array.isArray(parsed)) { this.points = []; this.emitPoints(); return; }

    this.points = parsed.map((p: any): Point => ({
      name: p.Name,
      lastUpdatedUnixMs: p.LastUpdatedUnixMs,
      x: p.X,
      y: p.Y,
      z: p.Z,
      rx: p.RX,
      ry: p.RY,
      rz: p.RZ
    }));

    this.emitPoints();
  }

  disconnect() {
    this.reconnect = false;
    if (this.ws?.readyState === 1){
      this.ws?.close();
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopStatusPolling();

    this.ws = null;
    this.connecting = false;

    // Reject all pending commands
    for (const [, pending] of this.pendingAcks) {
      pending.reject("Disconnected");
    }
    this.pendingAcks.clear();
  }

  // -------------------------
  // Status Events
  // -------------------------

  onStatus(cb: StatusListener) {
    this.statusListeners.push(cb);
    cb(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== cb);
    };
  }

  private emitStatus(update: Partial<RobotStatus>) {
    const prev = this.status;

    // One-shot fetches when the controller signals a repository change
    if (update.lastPointUpdate        !== undefined && update.lastPointUpdate        !== prev.lastPointUpdate)        this.getPoints().catch(() => {});
    if (update.lastToolUpdate         !== undefined && update.lastToolUpdate         !== prev.lastToolUpdate)         this.getTools().catch(() => {});
    if (update.lastLocalUpdate        !== undefined && update.lastLocalUpdate        !== prev.lastLocalUpdate)        this.getLocals().catch(() => {});
    if (update.lastBuiltProgramUpdate !== undefined && update.lastBuiltProgramUpdate !== prev.lastBuiltProgramUpdate) this.getBuiltPrograms().catch(() => {});
    if (update.lastGridUpdate         !== undefined && update.lastGridUpdate         !== prev.lastGridUpdate)         this.getGrids().catch(() => {});
    if (update.lastStackUpdate        !== undefined && update.lastStackUpdate        !== prev.lastStackUpdate)        this.getStacks().catch(() => {});

    const next = { ...prev, ...update };

    // Skip listener calls when nothing meaningful changed — prevents unnecessary React re-renders
    // while the robot is idle between poll ticks.
    if (this.statusEq(prev, next)) return;

    this.status = next;
    this.statusListeners.forEach(cb => cb(this.status));
  }

  private statusEq(a: RobotStatus, b: RobotStatus): boolean {
    // Non-primitive fields that require deep comparison
    const NON_PRIMITIVE: ReadonlySet<keyof RobotStatus> = new Set(['programs', 'backgroundPrograms']);

    // Compare over the union of all keys so newly added fields are never silently skipped
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof RobotStatus>;
    for (const key of keys) {
      const av = a[key], bv = b[key];
      if (NON_PRIMITIVE.has(key)) {
        if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      } else {
        if (av !== bv) return false;
      }
    }
    return true;
  }

  onPoints(cb: PointsListener) {
    const unsub = this.pointsTopic.on(cb);
    cb(this.points);
    return unsub;
  }

  private emitPoints() {
    this.pointsTopic.emit(this.points);
  }

  onTools(cb: ToolsListener) {
    const unsub = this.toolsTopic.on(cb);
    cb(this.tools);
    return unsub;
  }

  private emitTools() {
    this.toolsTopic.emit(this.tools);
  }

  onLocals(cb: LocalsListener) {
    const unsub = this.localsTopic.on(cb);
    cb(this.locals);
    return unsub;
  }

  private emitLocals() {
    this.localsTopic.emit(this.locals);
  }

  onBuiltPrograms(cb: BuiltProgramsListener) {
    const unsub = this.builtProgramsTopic.on(cb);
    cb(this.builtPrograms);
    return unsub;
  }

  private emitBuiltPrograms() {
    this.builtProgramsTopic.emit(this.builtPrograms);
  }

  onProgramImages(cb: ProgramImagesListener) {
    const unsub = this.programImagesTopic.on(cb);
    cb(this.programImages);
    return unsub;
  }

  private emitProgramImages() {
    this.programImagesTopic.emit(this.programImages);
  }

  onNanoIO(cb: NanoIOListener) {
    const unsub = this.nanoIOTopic.on(cb);
    cb(this.nanoIO);
    return unsub;
  }

  private emitNanoIO() {
    this.nanoIOTopic.emit(this.nanoIO);
  }

  onRelayIO(cb: RelayIOListener) {
    const unsub = this.relayIOTopic.on(cb);
    cb(this.relayIO);
    return unsub;
  }

  private emitRelayIO() {
    this.relayIOTopic.emit(this.relayIO);
  }

  onAuxAxis(cb: AuxAxisListener) {
    const unsub = this.auxAxisTopic.on(cb);
    cb(this.auxAxis);
    return unsub;
  }

  private emitAuxAxis() {
    this.auxAxisTopic.emit(this.auxAxis);
  }

  onCameras(cb: CamerasListener) {
    const unsub = this.camerasTopic.on(cb);
    cb(this.cameras);
    return unsub;
  }

  private emitCameras() {
    this.camerasTopic.emit(this.cameras);
  }

  onGrids(cb: GridsListener) {
    const unsub = this.gridsTopic.on(cb);
    cb(this.grids);
    return unsub;
  }

  private emitGrids() {
    this.gridsTopic.emit(this.grids);
  }

  private decodeGrids(data: any) {
    if (!data.grids) { this.grids = []; this.emitGrids(); return; }
    let parsed: any[];
    try { parsed = JSON.parse(data.grids); }
    catch { this.grids = []; this.emitGrids(); return; }
    if (!Array.isArray(parsed)) { this.grids = []; this.emitGrids(); return; }
    this.grids = parsed as Grid[];
    this.emitGrids();
  }

  onStacks(cb: StacksListener) {
    const unsub = this.stacksTopic.on(cb);
    cb(this.stacks);
    return unsub;
  }

  private emitStacks() {
    this.stacksTopic.emit(this.stacks);
  }

  private decodeStacks(data: any) {
    if (!data.stacks) { this.stacks = []; this.emitStacks(); return; }
    let parsed: any[];
    try { parsed = JSON.parse(data.stacks); }
    catch { this.stacks = []; this.emitStacks(); return; }
    if (!Array.isArray(parsed)) { this.stacks = []; this.emitStacks(); return; }
    this.stacks = parsed as RobotStack[];
    this.emitStacks();
  }

  private decodeTools(data: any) {
    if (!data.tools) { this.tools = []; this.emitTools(); return; }

    let parsed: any[];
    try { parsed = JSON.parse(data.tools); }
    catch { this.tools = []; this.emitTools(); return; }

    if (!Array.isArray(parsed)) { this.tools = []; this.emitTools(); return; }

    this.tools = parsed.map((t: any): Tool => ({
      name:              t.Name              ?? t.name              ?? "",
      description:       t.Description       ?? t.description       ?? "",
      lastUpdatedUnixMs: t.LastUpdatedUnixMs ?? t.lastUpdatedUnixMs ?? 0,
      x:  t.X  ?? t.x  ?? 0,
      y:  t.Y  ?? t.y  ?? 0,
      z:  t.Z  ?? t.z  ?? 0,
      rx: t.RX ?? t.rx ?? 0,
      ry: t.RY ?? t.ry ?? 0,
      rz: t.RZ ?? t.rz ?? 0,
    }));

    this.emitTools();
  }

  private decodeLocals(data: any) {
    if (!data.locals) { this.locals = []; this.emitLocals(); return; }

    let parsed: any[];
    try { parsed = JSON.parse(data.locals); }
    catch { this.locals = []; this.emitLocals(); return; }

    if (!Array.isArray(parsed)) { this.locals = []; this.emitLocals(); return; }

    this.locals = parsed.map((l: any): Local => ({
      name:              l.Name              ?? l.name              ?? "",
      description:       l.Description       ?? l.description       ?? "",
      lastUpdatedUnixMs: l.LastUpdatedUnixMs ?? l.lastUpdatedUnixMs ?? 0,
      x:  l.X  ?? l.x  ?? 0,
      y:  l.Y  ?? l.y  ?? 0,
      z:  l.Z  ?? l.z  ?? 0,
      rx: l.RX ?? l.rx ?? 0,
      ry: l.RY ?? l.ry ?? 0,
      rz: l.RZ ?? l.rz ?? 0,
    }));

    this.emitLocals();
  }

  // -------------------------
  // Messaging
  // -------------------------

  send<T extends object>(data: T) {
    if (!this.ws || !this.isConnected) {
      console.warn("[RobotWS] Not connected, cannot send");;
      return;
    }

    this.ws.send(JSON.stringify(data));
  }

  sendCommand(command: string, params: Record<string, any> = {}, timeoutMs = 10000) {
    if (!this.ws || !this.isConnected) {
      return Promise.reject("Not connected");
    }

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    const message = {
      type: "Command",
      id,
      command,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(`Command "${command}" timed out`);
      }, timeoutMs);

      this.pendingAcks.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject:  (reason) => { clearTimeout(timer); reject(reason); },
      });
      this.ws!.send(JSON.stringify(message));
    });
  }

  onMessage<T = any>(handler: MessageHandler<T>) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  private startStatusPolling() {
    if (this.statusInterval) return;

    this.statusInterval = setInterval(() => {
      if (this.isConnected) {
        this.getStatus().catch(() => {});
      }
    }, 100);
  }

  private stopStatusPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  get connected() {
    return this.isConnected;
  }

  // -------------------------
  // Available Commands
  // -------------------------

  public getStatus() {
    return this.sendCommand("GetStatus");
  }

  public getRobotInfo() {
    return this.sendCommand("GetRobotInfo");
  }

  public getPoints() {
    return this.sendCommand("GetPoints");
  }

  public stopJog() {
    return this.sendCommand("StopJog");
  }

  public hardStop() {
    return this.sendCommand("HardStop");
  }

  public jogL({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    return this.sendCommand("JogL", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public jogJ({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    return this.sendCommand("JogJ", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public jogTool({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    return this.sendCommand("JogTool", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public offsetL({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    return this.sendCommand("OffsetL", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public deletePoint(name: string) {
    return this.sendCommand("DeletePoint", { name });
  }

  public editPoint(name: string, fields: {
    newName?: string;
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number;
  }) {
    return this.sendCommand("EditPoint", { name, ...fields });
  }

  // ── Program cycle ───────────────────────────────────────────────────────────

  public setAvailablePrograms(programs: { name: string; description?: string; image?: string }[]) {
    return this.sendCommand('SetAvailablePrograms', { programs });
  }

  public setProgramStatus(update: {
    programName: string;
    programStatus?: ProgramStatus;
    currentStepNumber?: number;
    maxStepCount?: number;
    stepDescription?: string;
    errorDescription?: string;
    warningDescription?: string;
  }) {
    return this.sendCommand('SetProgramStatus', update);
  }

  public async getProgramImages(): Promise<Record<string, string | null>> {
    const data: any = await this.sendCommand('GetProgramImages');
    this.programImages = data?.images ?? {};
    this.emitProgramImages();
    return this.programImages;
  }

  public async getProgramLogs(
    programName: string,
    start?: number,
    end?: number
  ): Promise<{ programName: string; totalCount: number; start: number; logs: string[] }> {
    const data: any = await this.sendCommand('GetProgramLogs', {
      programName,
      ...(start !== undefined && { start }),
      ...(end   !== undefined && { end }),
    });
    return {
      programName: data?.programName ?? programName,
      totalCount:  data?.totalCount  ?? 0,
      start:       data?.start       ?? 0,
      logs:        Array.isArray(data?.logs) ? data.logs : [],
    };
  }

  public startProgram(programName: string) {
    return this.sendCommand('StartProgram', { programName });
  }

  public stopProgram(programName: string) {
    return this.sendCommand('StopProgram', { programName });
  }

  public resetProgram(programName: string) {
    return this.sendCommand('ResetProgram', { programName });
  }

  public abortProgram(programName: string) {
    return this.sendCommand('AbortProgram', { programName });
  }

  public setSpeedOverride(percent: number) {
    return this.sendCommand('SetSpeedOverride', { percent });
  }

  // ── Tool repository ───────────────────────────────────────────────────────

  public getTools() {
    return this.sendCommand("GetTools");
  }

  public createTool(tool: {
    name: string;
    description?: string;
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number;
  }) {
    return this.sendCommand("CreateTool", { ...tool });
  }

  public editTool(name: string, fields: {
    newName?: string;
    description?: string;
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number;
  }) {
    return this.sendCommand("EditTool", { name, ...fields });
  }

  public deleteTool(name: string) {
    return this.sendCommand("DeleteTool", { name });
  }

  public setActiveTool(name: string) {
    return this.sendCommand("SetActiveTool", { name });
  }

  // ── Local repository ──────────────────────────────────────────────────────

  public getLocals() {
    return this.sendCommand("GetLocals");
  }

  public createLocal(local: {
    name: string;
    description?: string;
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number;
  }) {
    return this.sendCommand("CreateLocal", { ...local });
  }

  public editLocal(name: string, fields: {
    newName?: string;
    description?: string;
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number;
  }) {
    return this.sendCommand("EditLocal", { name, ...fields });
  }

  public deleteLocal(name: string) {
    return this.sendCommand("DeleteLocal", { name });
  }

  public setActiveLocal(name: string) {
    return this.sendCommand("SetActiveLocal", { name });
  }

  // ── Built program repository ──────────────────────────────────────────────

  private decodeBuiltPrograms(data: any) {
    if (!data.programs) { this.builtPrograms = []; this.emitBuiltPrograms(); return; }

    let parsed: any[];
    try { parsed = JSON.parse(data.programs); }
    catch { this.builtPrograms = []; this.emitBuiltPrograms(); return; }

    if (!Array.isArray(parsed)) { this.builtPrograms = []; this.emitBuiltPrograms(); return; }

    this.builtPrograms = parsed as BuiltProgram[];
    this.emitBuiltPrograms();
  }

  public getBuiltPrograms() {
    return this.sendCommand("GetBuiltPrograms");
  }

  public saveBuiltProgram(program: BuiltProgram) {
    return this.sendCommand("SaveBuiltProgram", {
      id:                  program.id ?? '',
      name:                program.name,
      description:         program.description,
      steps:               program.steps,
      variables:           program.variables,
      isRoutine:           program.isRoutine           ?? false,
      isBackground:        program.isBackground        ?? false,
      killBackgroundOnStop: program.killBackgroundOnStop ?? true,
    });
  }

  public deleteBuiltProgram(name: string) {
    return this.sendCommand("DeleteBuiltProgram", { name });
  }

  // ── Grid repository ───────────────────────────────────────────────────────

  public getGrids() {
    return this.sendCommand("GetGrids");
  }

  public saveGrid(grid: Grid) {
    return this.sendCommand("SaveGrid", {
      id:            grid.id,
      name:          grid.name,
      basePointName: grid.basePointName,
      rowOffsetX:    grid.rowOffsetX,
      rowOffsetY:    grid.rowOffsetY,
      rowOffsetZ:    grid.rowOffsetZ,
      colOffsetX:    grid.colOffsetX,
      colOffsetY:    grid.colOffsetY,
      colOffsetZ:    grid.colOffsetZ,
      rowCount:      grid.rowCount,
      colCount:      grid.colCount,
      rotation:      grid.rotation,
    });
  }

  public deleteGrid(id: string) {
    return this.sendCommand("DeleteGrid", { id });
  }

  public getStacks() {
    return this.sendCommand("GetStacks");
  }

  public saveStack(stack: RobotStack) {
    return this.sendCommand("SaveStack", {
      id:            stack.id,
      name:          stack.name,
      basePointName: stack.basePointName,
      offsetX:       stack.offsetX,
      offsetY:       stack.offsetY,
      offsetZ:       stack.offsetZ,
      maxCount:      stack.maxCount,
    });
  }

  public deleteStack(id: string) {
    return this.sendCommand("DeleteStack", { id });
  }

  public saveProgramImage(name: string, imageBase64: string) {
    return this.sendCommand("SaveBuiltProgramImage", { name, image: imageBase64 })
      .then(() => this.getProgramImages().catch(() => {}));
  }

  public executeBuiltProgram(name: string) {
    return this.sendCommand("ExecuteBuiltProgram", { name });
  }

  public stopBuiltProgram(name: string) {
    return this.sendCommand("StopBuiltProgram", { name });
  }

  public startBackgroundProgram(name: string) {
    return this.sendCommand("StartBackgroundProgram", { name });
  }

  public stopBackgroundProgram(name: string) {
    return this.sendCommand("StopBackgroundProgram", { name });
  }

  public async getProgramVariables(name: string): Promise<{ name: string; value: number; isBoolean: boolean }[]> {
    const data = await this.sendCommand("GetProgramVariables", { name }) as any;
    try { return Array.isArray(data?.variables) ? data.variables : []; } catch { return []; }
  }

  // ── STB4100 (Robot IO Board) ───────────────────────────────────────────────

  /** output: 1-4, value: true/false */
  public setSTBOutput(output: number, value: boolean) {
    return this.sendCommand("SetSTBOutput", { pin: output, value });
  }

  // ── Nano IO ────────────────────────────────────────────────────────────────

  public getIO() {
    return this.sendCommand("GetIO");
  }

  public setNanoOutput(nanoId: string, pin: number, value: boolean) {
    return this.sendCommand("SetNanoOutput", { nanoId, pin, value });
  }

  public setNeoPixel(nanoId: string, pin: number, colors: NeoPixelColor[]) {
    return this.sendCommand("SetNeoPixel", { nanoId, pin, colors });
  }

  public renameNanoPin(nanoId: string, pin: number, name: string) {
    return this.sendCommand("RenameNanoPin", { nanoId, pin, name })
      .then(() => this.getIO().catch(() => {}));
  }

  public configureNanoPin(nanoId: string, pin: number, type: string, pixelCount = 8) {
    return this.sendCommand("ConfigureNanoPin", { nanoId, pin, type, pixelCount })
      .then(() => this.getIO().catch(() => {}));
  }

  public setRobotIdentity(fields: { robotName?: string; robotType?: string }) {
    return this.sendCommand("SetRobotIdentity", fields);
  }

  public restartController() {
    return this.sendCommand("RestartController");
  }

  public updateController() {
    return this.sendCommand("Update");
  }

  public getRobotConfig(): Promise<{
    robotType: string;
    homingSpeed: number;
    j1HomeOffsetDeg: number;
    verticalHomePosition: number;
    horizontalHomePosition: number;
    verticalHomingDirection: number;
    horizontalHomingDirection: number;
    j1HomingDirection: number;
    j4HomeOffsetDeg: number;
    m1Direction: number;
    m2Direction: number;
    m3Direction: number;
    m4Direction: number;
    enableStbCard: boolean;
    enableNanoCards: boolean;
    enableRelayCard: boolean;
    enableAuxAxis: boolean;
    enableCameras: boolean;
    jogSlowSpeed: number;
    jogNormalSpeed: number;
    jogFastSpeed: number;
    cncStepsPerRevX: number;
    cncStepsPerRevY: number;
    cncStepsPerRevZ: number;
    cncStepsPerRevRZ: number;
    cncMmPerRevX: number;
    cncMmPerRevY: number;
    cncMmPerRevZ: number;
    cncDegPerRevRZ: number;
    cncXHomePosition: number;
    cncYHomePosition: number;
    cncZHomePosition: number;
    cncRzHomePosition: number;
    cncXHomingDirection: number;
    cncYHomingDirection: number;
    cncZHomingDirection: number;
  }> {
    return this.sendCommand("GetRobotConfig") as any;
  }

  public setRobotConfig(fields: {
    robotType?: string;
    homingSpeed?: number;
    j1HomeOffsetDeg?: number;
    verticalHomePosition?: number;
    horizontalHomePosition?: number;
    verticalHomingDirection?: number;
    horizontalHomingDirection?: number;
    j1HomingDirection?: number;
    j4HomeOffsetDeg?: number;
    enableStbCard?: boolean;
    enableNanoCards?: boolean;
    enableRelayCard?: boolean;
    enableAuxAxis?: boolean;
    enableCameras?: boolean;
    jogSlowSpeed?: number;
    jogNormalSpeed?: number;
    jogFastSpeed?: number;
    cncStepsPerRevX?: number;
    cncStepsPerRevY?: number;
    cncStepsPerRevZ?: number;
    cncStepsPerRevRZ?: number;
    cncMmPerRevX?: number;
    cncMmPerRevY?: number;
    cncMmPerRevZ?: number;
    cncDegPerRevRZ?: number;
    cncXHomePosition?: number;
    cncYHomePosition?: number;
    cncZHomePosition?: number;
    cncRzHomePosition?: number;
    cncXHomingDirection?: number;
    cncYHomingDirection?: number;
    cncZHomingDirection?: number;
  }) {
    return this.sendCommand("SetRobotConfig", fields);
  }

  // ── Aux Axis ───────────────────────────────────────────────────────────────

  public getAuxState() {
    return this.sendCommand("GetAuxState");
  }

  public getAuxConfig() {
    return this.sendCommand("GetAuxConfig");
  }

  public jogAux(params: {
    deviceId?: string;
    axis: number;
    velocity: number;
    accel?: number;
    decel?: number;
  }) {
    return this.sendCommand("JogAux", {
      deviceId: params.deviceId ?? "AUX_STEPPER_001",
      axis:     params.axis,
      velocity: params.velocity,
      accel:    params.accel  ?? 3200,
      decel:    params.decel  ?? 5000,
    });
  }

  public stopAux(params?: { decel?: number; immediate?: boolean }) {
    return this.sendCommand("StopAux", {
      decel:     params?.decel     ?? 5000,
      immediate: params?.immediate ?? false,
    });
  }

  public setAuxAxisConfig(params: {
    deviceId: string;
    axisIndex: number;
    name: string;
    stepsPerRev: number;
    invertDirection: boolean;
    axisType: string;
    gearRatio: number;
    mmPerRev: number;
  }) {
    return this.sendCommand("SetAuxAxisConfig", params);
  }

  public enableAux(deviceId: string, enable: boolean) {
    return this.sendCommand("EnableAux", { deviceId, enable });
  }

  // ── Cameras ────────────────────────────────────────────────────────────────

  public getCameras() {
    return this.sendCommand("GetCameras");
  }

  public addCamera(params: {
    name: string;
    deviceIndex: number;
    enabled?: boolean;
    width?: number;
    height?: number;
    targetFps?: number;
  }) {
    return this.sendCommand("AddCamera", {
      name:        params.name,
      deviceIndex: params.deviceIndex,
      enabled:     params.enabled     ?? true,
      width:       params.width       ?? 640,
      height:      params.height      ?? 480,
      targetFps:   params.targetFps   ?? 15,
    });
  }

  public removeCamera(id: string) {
    return this.sendCommand("RemoveCamera", { id });
  }

  public setCameraConfig(params: {
    id: string;
    name: string;
    deviceIndex: number;
    enabled: boolean;
    width: number;
    height: number;
    targetFps: number;
  }) {
    return this.sendCommand("SetCameraConfig", params);
  }

  public async getCameraResolutions(deviceIndex: number): Promise<{ width: number; height: number }[]> {
    try {
      const data: any = await this.sendCommand("GetCameraResolutions", { deviceIndex }, 30000);
      if (!data.resolutions) return [];
      return JSON.parse(data.resolutions) as { width: number; height: number }[];
    } catch {
      return [];
    }
  }

  /** Build the HTTP base URL from the current WebSocket URL (ws:// → http://). */
  public httpBaseUrl(): string | null {
    if (!this.url) return null;
    return this.url.replace(/^ws:/, 'http:').replace(/\/control$/, '');
  }

  public cameraWsUrl(id: string): string | null {
    if (!this.url) return null;
    return this.url.replace(/\/control$/, '') + `/camera/${id}/ws`;
  }

  public cameraSnapshotUrl(id: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/camera/${id}/snapshot` : null;
  }

  // ── Vision programs ────────────────────────────────────────────────────────

  public async getVisionPrograms(): Promise<{ programs: VisionProgram[]; runningIds: string[] }> {
    const data: any = await this.sendCommand('GetVisionPrograms');
    let programs: VisionProgram[] = [];
    try { programs = JSON.parse(data?.programs ?? '[]'); } catch { }
    return { programs, runningIds: data?.runningIds ?? [] };
  }

  public async saveVisionProgram(program: VisionProgram): Promise<{ id: string; lastUpdatedUnixMs: number }> {
    return this.sendCommand('SaveVisionProgram', program) as any;
  }

  public deleteVisionProgram(id: string) {
    return this.sendCommand('DeleteVisionProgram', { id });
  }

  public startVision(id: string) {
    return this.sendCommand('StartVision', { id });
  }

  public stopVision(id: string) {
    return this.sendCommand('StopVision', { id });
  }

  public async getVisionResult(id: string): Promise<VisionResult | null> {
    const data: any = await this.sendCommand('GetVisionResult', { id });
    if (!data?.result) return null;
    try { return JSON.parse(data.result) as VisionResult; } catch { return null; }
  }

  public visionWsUrl(id: string): string | null {
    if (!this.url) return null;
    return this.url.replace(/\/control$/, '') + `/vision/${id}/ws`;
  }

  public visionSnapshotUrl(id: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/vision/${id}/snapshot` : null;
  }

  public visionPolygonDebugUrl(programId: string, inspectionId: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/vision/${programId}/debug/polygon/${inspectionId}` : null;
  }

  public visionLineDebugUrl(programId: string, inspectionId: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/vision/${programId}/debug/line/${inspectionId}` : null;
  }

  public visionAnnotatedUrl(id: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/vision/${id}/annotated` : null;
  }

  public programVisionSnapshotUrl(visionProgramId: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/program-vision-snapshot/${visionProgramId}` : null;
  }

  public setRelay(relay: number, value: boolean) {
    // Optimistic update — reflect the change immediately before the server confirms
    if (this.relayIO) {
      const relays = [...(this.relayIO.relays ?? [false, false, false, false])];
      relays[relay - 1] = value;
      this.relayIO = { ...this.relayIO, relays };
      this.emitRelayIO();
    }
    return this.sendCommand("SetRelay", { relay, value });
  }

  public renameRelay(relay: number, name: string) {
    // Optimistic update
    if (this.relayIO) {
      const names = [...(this.relayIO.names ?? ["Relay 1", "Relay 2", "Relay 3", "Relay 4"])];
      names[relay - 1] = name;
      this.relayIO = { ...this.relayIO, names };
      this.emitRelayIO();
    }
    return this.sendCommand("RenameRelay", { relay, name });
  }

  // ── DXF files ──────────────────────────────────────────────────────────────

  public async listDxfFiles(): Promise<string[]> {
    const base = this.httpBaseUrl();
    if (!base) throw new Error('Not connected');
    const res = await fetch(`${base}/dxf`);
    if (!res.ok) throw new Error(`listDxfFiles: ${res.status}`);
    return res.json();
  }

  public async uploadDxfFile(name: string, content: string): Promise<void> {
    const base = this.httpBaseUrl();
    if (!base) throw new Error('Not connected');
    const res = await fetch(`${base}/dxf?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: content,
    });
    if (!res.ok) throw new Error(`uploadDxfFile: ${res.status}`);
  }

  public async getDxfFile(name: string): Promise<string> {
    const base = this.httpBaseUrl();
    if (!base) throw new Error('Not connected');
    const res = await fetch(`${base}/dxf/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`getDxfFile: ${res.status}`);
    return res.text();
  }

  public async deleteDxfFile(name: string): Promise<void> {
    const base = this.httpBaseUrl();
    if (!base) throw new Error('Not connected');
    const res = await fetch(`${base}/dxf/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`deleteDxfFile: ${res.status}`);
  }

  public dxfFileUrl(name: string): string | null {
    const base = this.httpBaseUrl();
    return base ? `${base}/dxf/${encodeURIComponent(name)}` : null;
  }
}


export const robotClient = new RobotConnectService()