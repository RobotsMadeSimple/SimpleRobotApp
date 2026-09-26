import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "../connections/robotState";
import { AuxDeviceState, BuiltProgram, CalibrationDetectOptions, CalibrationRobotPoint, CalibrationSession, CalibrationSolveResult, CalibrationTaughtDot, CameraCalibration, CameraCodec, CameraDecoder, CameraSourceTestResult, CameraSourceType, CameraState, CameraStream, CameraTransport, Matrix3, ExpressionEvaluation, ExpressionSymbols, ProgramRevision, ValidationProblem, Grid, Local, NanoState, NeoPixelColor, Point, ProgramImageSnapshot, ProgramStatus, ProgramVariableSnapshot, RobotInfo, RobotStack, RobotStatus, Tool, UsbRelayState, VisionProgram, VisionResult, createDefaultStatus } from "../models/robotModels";
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
  private lastRelayJson:  string                        = "";
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
    });

    // Auto-reconnect to the last connected robot (persisted across page refreshes).
    const persisted = getSelectedRobot();
    if (persisted) {
      this.url = `ws://${persisted.ipAddress}:${persisted.port}/control`;
      this.reconnect = true;
      this.connect();
    }
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

    this.ws.onclose = (event: any) => {
      // React Native dispatches a bare Event for `error` with no detail, then
      // forwards the native failure text here as `reason`. This is the only
      // place the actual cause (refused, unreachable, ...) is visible.
      const reason = event?.reason;
      console.log("[RobotWS] Disconnected from", this.url, reason ? `— ${reason}` : "");
      this.emitStatus({ connected: false });

      this.cleanup();

      if (this.reconnect) {
        setTimeout(() => this.connect(), this.reconnectIntervalMs);
      }
    };

    this.ws.onerror = () => {
      // Deliberately quiet — the close handler above always follows and is the
      // one that carries the reason.
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

    // A failed command must reject its caller — the server reports handler
    // errors as ok:false + error. Resolving these silently made failures
    // (e.g. configuring pins on a disconnected Nano) look like successes.
    if (data.ok === false) {
      this.pendingAcks.delete(data.id);
      pending.reject(data.error ?? `Command "${data.command}" failed`);
      return;
    }

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
        // Relay board state now rides along in the status broadcast so relays
        // changed by a running program update live (not just on page entry).
        this.updateRelayFromStatus(data.relay);
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

  // Apply the relay board state carried in the status broadcast (an object,
  // unlike the JSON string GetIO returns). Only emits when it actually changed,
  // so relay-page consumers don't re-render on every status tick.
  private updateRelayFromStatus(relay: any) {
    if (!relay || typeof relay !== "object") return;
    const json = JSON.stringify(relay);
    if (json === this.lastRelayJson) return;
    this.lastRelayJson = json;
    this.relayIO = relay as UsbRelayState;
    this.emitRelayIO();
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

  /**
   * Fire-and-forget command: sends immediately without registering an ack, a
   * promise, or a timeout. For the high-rate jog heartbeat (and StopJog), where a
   * tracked reply per tick is pure overhead — omitting the id means the ack the
   * controller still sends comes back id-less and is ignored by onmessage. No-op
   * when the socket isn't open, so a dropped connection never throws mid-jog.
   */
  private sendCommandNoAck(command: string, params: Record<string, any> = {}) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "Command", command, params }));
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

  // StopJog and the jog heartbeat go out fire-and-forget: no caller awaits them,
  // and skipping the ack/promise/timeout churn keeps release snappy and the
  // socket clear (the controller's velocity profiler runs continuously with a
  // ~1s watchdog, so these are keep-alives, not per-tick moves).
  public stopJog() {
    this.sendCommandNoAck("StopJog");
  }

  public hardStop() {
    return this.sendCommand("HardStop");
  }

  public jogL({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    this.sendCommandNoAck("JogL", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public jogJ({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    this.sendCommandNoAck("JogJ", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
  }

  public jogTool({ x = 0, y = 0, z = 0, rz = 0, speed = 100, accel = 100, decel = 100 }: MoveParams) {
    this.sendCommandNoAck("JogTool", { X: x, Y: y, Z: z, RZ: rz, Speed: speed, Accel: accel, Decel: decel });
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

  /** The wire shape of a program, shared by SaveBuiltProgram and ValidateBuiltProgram. */
  private builtProgramParams(program: BuiltProgram) {
    return {
      id:                  program.id ?? '',
      name:                program.name,
      description:         program.description,
      steps:               program.steps,
      variables:           program.variables,
      isRoutine:           program.isRoutine           ?? false,
      isBackground:        program.isBackground        ?? false,
      killBackgroundOnStop: program.killBackgroundOnStop ?? true,
    };
  }

  public saveBuiltProgram(program: BuiltProgram) {
    return this.sendCommand("SaveBuiltProgram", this.builtProgramParams(program));
  }

  public deleteBuiltProgram(name: string) {
    return this.sendCommand("DeleteBuiltProgram", { name });
  }

  // ── Program-editor services (docs/expressions-and-variables.md) ───────────
  //
  // Newer controller commands. An older controller answers them with
  // ok:false / "unknownCommand", which surfaces here as UnsupportedCommandError
  // so a caller can hide the feature instead of reporting a failure.

  /**
   * Send a command and return its ACK, turning `ok: false` into a thrown error.
   * Works whether sendCommand resolves failed ACKs or rejects them.
   */
  private async request(command: string, params: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>> {
    let data: unknown;
    try {
      data = await this.sendCommand(command, params, timeoutMs);
    } catch (e) {
      throw toCommandError(command, e);
    }
    const ack = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (ack.ok === false) throw toCommandError(command, ack.error);
    return ack;
  }

  /** Check a (possibly unsaved) program. Resolves the problem list; empty = clean. */
  public async validateBuiltProgram(program: BuiltProgram): Promise<ValidationProblem[]> {
    const ack = await this.request("ValidateBuiltProgram", { program: this.builtProgramParams(program) });
    return wireArray(ack.problems).map(normalizeProblem).filter((p): p is ValidationProblem => p !== null);
  }

  /**
   * Evaluate an expression against the named running program (or globals + IO +
   * properties when none). An evaluation error is a normal result (`ok: false`);
   * only an unsupported command or a transport failure throws.
   */
  public async evaluateExpression(expression: string, programName?: string): Promise<ExpressionEvaluation> {
    try {
      const ack = await this.request("EvaluateExpression", programName ? { expression, programName } : { expression });
      const value = typeof ack.value === "number" ? ack.value : Number(ack.value);
      return Number.isFinite(value) && ack.value !== null && ack.value !== undefined
        ? { ok: true, value, isBoolean: ack.isBoolean === true }
        : { ok: false, error: typeof ack.error === "string" && ack.error ? ack.error : "No value" };
    } catch (e) {
      if (e instanceof CommandFailedError) return { ok: false, error: e.message };
      throw e;
    }
  }

  /** Variables, read-only properties, functions and IO names an expression may use. */
  public async getExpressionSymbols(programName?: string): Promise<ExpressionSymbols> {
    const ack = await this.request("GetExpressionSymbols", programName ? { programName } : {});
    return {
      variables: wireArray(ack.variables).filter(isNamed).map(v => ({
        name:         stripSigil(v.name),
        kind:         VARIABLE_KINDS.find(k => k === v.kind) ?? "number",
        elementType:  ELEMENT_TYPES.find(k => k === v.elementType),
        isGlobal:     v.isGlobal === true,
        isPersistent: v.isPersistent === true,
        expression:   typeof v.expression === "string" ? v.expression : undefined,
        value:        typeof v.value === "number" || typeof v.value === "string" || typeof v.value === "boolean" ? v.value : undefined,
      })),
      properties: wireArray(ack.properties).filter(isNamed).map(p => ({
        name: stripSigil(p.name), description: str(p.description), type: str(p.type),
      })),
      functions: wireArray(ack.functions).filter(isNamed).map(f => ({
        name: f.name, signature: str(f.signature) || `${f.name}()`, description: str(f.description),
      })),
      io: wireArray(ack.io).filter(isNamed).map(i => ({
        name: stripSigil(i.name), description: str(i.description),
      })),
    };
  }

  /** Stored revisions of a program, newest first. */
  public async getBuiltProgramRevisions(name: string): Promise<ProgramRevision[]> {
    const ack = await this.request("GetBuiltProgramRevisions", { name });
    return wireArray(ack.revisions)
      .filter(r => r.id !== undefined && r.id !== null && r.id !== "")
      .map(r => ({
        id:            String(r.id),
        savedUnixMs:   Number(r.savedUnixMs ?? r.id) || 0,
        stepCount:     Number(r.stepCount) || 0,
        variableCount: Number(r.variableCount) || 0,
        note:          typeof r.note === "string" && r.note ? r.note : undefined,
      }))
      .sort((a, b) => b.savedUnixMs - a.savedUnixMs);
  }

  /** The full content of one stored revision. */
  public async getBuiltProgramRevision(name: string, id: string): Promise<BuiltProgram> {
    const ack = await this.request("GetBuiltProgramRevision", { name, id });
    return wireProgram(ack.program, name);
  }

  /**
   * Make a stored revision the current program (the controller records the
   * replaced content as a new revision first). Refreshes the program list and
   * resolves the restored program.
   */
  public async restoreBuiltProgramRevision(name: string, id: string): Promise<BuiltProgram> {
    const ack = await this.request("RestoreBuiltProgramRevision", { name, id });
    this.getBuiltPrograms().catch(() => {});
    return wireProgram(ack.program, name);
  }

  // ── Camera-to-robot calibration (docs/camera-calibration.md) ──────────────
  //
  // All additive: an older controller answers "unknownCommand", which surfaces as
  // UnsupportedCommandError so the UI can hide Calibrate instead of failing.
  // Other failures are CommandFailedError whose message is the contract's error
  // code (noDotsFound, gridNotFound, notEnoughTaught, …).

  /** The saved calibration for a camera, or null when it has none. */
  public async getCameraCalibration(cameraId: string): Promise<CameraCalibration | null> {
    const ack = await this.request("GetCameraCalibration", { cameraId });
    return wireCalibration(ack.calibration);
  }

  public async deleteCameraCalibration(cameraId: string): Promise<void> {
    await this.request("DeleteCameraCalibration", { cameraId });
  }

  /** Grab a frame, detect the dot grid and open a session. */
  public async calibrationStart(cameraId: string, dotPitchMm: number, options: CalibrationDetectOptions = {}): Promise<CalibrationSession> {
    const ack = await this.request("CalibrationStart", { cameraId, dotPitchMm, ...detectParams(options) }, 30000);
    return wireSession(ack);
  }

  /** New frame, same session; taught dots whose index still matches are kept. */
  public async calibrationRedetect(sessionId: string, options: CalibrationDetectOptions = {}): Promise<CalibrationSession> {
    const ack = await this.request("CalibrationRedetect", { sessionId, ...detectParams(options) }, 30000);
    return wireSession(ack, sessionId);
  }

  /** Record the current TCP position for a dot. Resolves the full taught list. */
  public async calibrationTeachDot(sessionId: string, dotIndex: number): Promise<CalibrationTaughtDot[]> {
    const ack = await this.request("CalibrationTeachDot", { sessionId, dotIndex });
    return wireTaught(ack.taught);
  }

  public async calibrationUnteachDot(sessionId: string, dotIndex: number): Promise<CalibrationTaughtDot[]> {
    const ack = await this.request("CalibrationUnteachDot", { sessionId, dotIndex });
    return wireTaught(ack.taught);
  }

  /** Fit sheet → robot from the taught dots; saves it as the camera's calibration unless `save` is false. */
  public async calibrationSolve(sessionId: string, save = true): Promise<CalibrationSolveResult> {
    const ack = await this.request("CalibrationSolve", { sessionId, save });
    const calibration = wireCalibration(ack.calibration);
    if (!calibration) throw new Error("The controller returned no calibration");
    return {
      calibration,
      taughtRmsMm:        num(ack.taughtRmsMm, calibration.taughtRmsMm),
      taughtMaxMm:        num(ack.taughtMaxMm, calibration.taughtMaxMm),
      pitchScaleEstimate: num(ack.pitchScaleEstimate, calibration.pitchScaleEstimate),
      warnings:           strArray(ack.warnings),
    };
  }

  /** Map a normalized image point to robot X/Y/Z via a saved calibration (cameraId) or a solved session. */
  public async calibrationPredict(source: { cameraId: string } | { sessionId: string }, u: number, v: number): Promise<CalibrationRobotPoint> {
    const ack = await this.request("CalibrationPredict", { ...source, u, v });
    const robot = wirePoint(parseMaybeJson(ack.robot));
    if (!robot) throw new Error("The controller returned no prediction");
    return robot;
  }

  public async calibrationDiscard(sessionId: string): Promise<void> {
    await this.request("CalibrationDiscard", { sessionId });
  }

  /** Absolute URL for a server-relative path such as a session's `imageUrl`. */
  public calibrationImageUrl(imageUrl: string): string | null {
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    const base = this.httpBaseUrl();
    return base ? `${base}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}` : null;
  }

  /** Straight-line move to a Cartesian target (same wire shape the jog page's type-a-position move sends). */
  public moveL(target: { x: number; y: number; z: number; rz: number }, speed?: number) {
    return this.sendCommand("MoveL", { X: target.x, Y: target.y, Z: target.z, RZ: target.rz, Speed: speed });
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

  /**
   * "Run Again" for a Complete program: reset it, then start it. Built programs
   * run in the controller's executor; external programs are flagged to start.
   * One place for the sequence so every page behaves identically.
   */
  public runProgramAgain(name: string, isBuilt: boolean) {
    this.resetProgram(name).catch(() => {});
    return isBuilt
      ? this.executeBuiltProgram(name).catch(() => {})
      : this.startProgram(name).catch(() => {});
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

  /**
   * One poll's worth of monitored state: scalar values, plus display images as name and
   * revision. Both come back together because they are one round-trip on the controller
   * and the monitor wants them on the same tick.
   *
   * `images` carries no bytes — fetch those with getProgramVariableImage when a revision
   * changes. Older controllers omit the key entirely, which reads as no images.
   */
  public async getProgramVariables(name: string): Promise<{
    variables: ProgramVariableSnapshot[];
    images: ProgramImageSnapshot[];
  }> {
    const data = await this.sendCommand("GetProgramVariables", { name }) as any;
    return {
      variables: Array.isArray(data?.variables) ? data.variables : [],
      images:    Array.isArray(data?.images)    ? data.images    : [],
    };
  }

  /** The base64 bytes of one display image variable. "" when there is nothing to show. */
  public async getProgramVariableImage(name: string, variable: string): Promise<string> {
    const data = await this.sendCommand("GetProgramVariableImage", { name, variable }) as any;
    return typeof data?.image === "string" ? data.image : "";
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
    jointLimitsEnabled: boolean;
    joint1Min: number | null;
    joint1Max: number | null;
    joint2Min: number | null;
    joint2Max: number | null;
    joint3Min: number | null;
    joint3Max: number | null;
    joint4Min: number | null;
    joint4Max: number | null;
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
    jointLimitsEnabled?: boolean;
    joint1Min?: number | null;
    joint1Max?: number | null;
    joint2Min?: number | null;
    joint2Max?: number | null;
    joint3Min?: number | null;
    joint3Max?: number | null;
    joint4Min?: number | null;
    joint4Max?: number | null;
  }) {
    return this.sendCommand("SetRobotConfig", fields);
  }

  // ── Joint-limit fault recovery ─────────────────────────────────────────────

  /** Acknowledge and clear a latched joint-limit fault (also exits bypass). */
  public clearFault() {
    return this.sendCommand("ClearFault");
  }

  /** Enter/exit recovery bypass so a faulted robot can be jogged back into range. */
  public setLimitBypass(enable: boolean) {
    return this.sendCommand("SetLimitBypass", { enable });
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
  } & CameraSourceParams) {
    return this.sendCommand("AddCamera", {
      name:        params.name,
      deviceIndex: params.deviceIndex,
      enabled:     params.enabled     ?? true,
      width:       params.width       ?? 640,
      height:      params.height      ?? 480,
      targetFps:   params.targetFps   ?? 15,
      ...cameraSourceParams(params),
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
  } & CameraSourceParams) {
    const {
      sourceType, url, username, password, transport,
      host, port, stream, codec, decoder, ffmpegPath, hwaccel,
      ...rest
    } = params;
    return this.sendCommand("SetCameraConfig", {
      ...rest,
      ...cameraSourceParams({ sourceType, url, username, password, transport, host, port, stream, codec, decoder, ffmpegPath, hwaccel }),
    });
  }

  /**
   * Open a stream URL, or log into a Sofia (DVRIP/XMeye) camera, once on the
   * controller and grab one frame (docs/network-cameras.md). A failed test
   * (`ok: false`, error code) is a result, not an exception; an older
   * controller throws UnsupportedCommandError.
   */
  public async testCameraSource(params: {
    sourceType?: "network";
    url: string;
    username?: string;
    password?: string;
    transport?: CameraTransport;
    timeoutMs?: number;
  } | {
    sourceType: "sofia";
    host: string;
    port?: number;
    username?: string;
    password?: string;
    stream?: CameraStream;
    codec?: CameraCodec;
    decoder?: CameraDecoder;
    ffmpegPath?: string;
    timeoutMs?: number;
  }): Promise<CameraSourceTestResult> {
    const timeoutMs = params.timeoutMs ?? 8000;
    const wire: Record<string, unknown> = { timeoutMs };
    if (params.sourceType === "sofia") {
      wire.sourceType = "sofia";
      wire.host       = params.host;
      if (params.port != null) wire.port = params.port;
      if (params.username)     wire.username   = params.username;
      if (params.password)     wire.password   = params.password;
      if (params.stream)       wire.stream     = params.stream;
      if (params.codec)        wire.codec      = params.codec;
      if (params.decoder)      wire.decoder    = params.decoder;
      if (params.ffmpegPath)   wire.ffmpegPath = params.ffmpegPath;
    } else {
      wire.url = params.url;
      if (params.username)  wire.username  = params.username;
      if (params.password)  wire.password  = params.password;
      if (params.transport) wire.transport = params.transport;
    }
    const failed = (error: string): CameraSourceTestResult => ({ ok: false, width: 0, height: 0, openMs: 0, firstFrameMs: 0, error });
    try {
      // Give the controller its own open timeout plus headroom before the socket gives up.
      const ack = await this.request("TestCameraSource", wire, timeoutMs + 5000);
      return {
        ok:              true,
        width:           num(ack.width),
        height:          num(ack.height),
        openMs:          num(ack.openMs),
        firstFrameMs:    num(ack.firstFrameMs),
        loginMs:         ack.loginMs         !== undefined ? num(ack.loginMs) : undefined,
        detectedCodec:   ack.detectedCodec   !== undefined ? (ack.detectedCodec as "h264" | "hevc" | "unknown") : undefined,
        firstFrameBytes: ack.firstFrameBytes !== undefined ? num(ack.firstFrameBytes) : undefined,
      };
    } catch (e) {
      if (e instanceof CommandFailedError) return failed(e.message || "openFailed");
      throw e;
    }
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

  /**
   * Resolved XY toolpath of the CNC block currently executing on the robot —
   * origin anchor and runtime variables applied. Null when no block is active.
   */
  public async getCncToolpath(): Promise<{ programName: string; paths: number[][]; holes: { x: number; y: number }[] } | null> {
    const data: any = await this.sendCommand('GetCncToolpath', {});
    return data?.toolpath ?? null;
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
    // Refresh from the controller's config afterwards — without this a save
    // with the relay board disconnected looked like it did nothing.
    return this.sendCommand("RenameRelay", { relay, name })
      .then((v) => { this.getIO().catch(() => {}); return v; });
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

// ── Wire helpers for the program-editor commands ─────────────────────────────

/** The controller does not know the command (an older build). Hide the feature. */
export class UnsupportedCommandError extends Error {
  constructor(public readonly command: string) {
    super(`${command} is not supported by this controller`);
    this.name = "UnsupportedCommandError";
  }
}

/** The controller ran the command and reported `ok: false` with this message. */
export class CommandFailedError extends Error {
  constructor(public readonly command: string, message: string) {
    super(message);
    this.name = "CommandFailedError";
  }
}

export function isUnsupportedCommand(e: unknown): e is UnsupportedCommandError {
  return e instanceof UnsupportedCommandError;
}

// sendCommand's own rejections. Those say nothing about whether the command
// exists, so they stay plain errors rather than CommandFailedError.
const TRANSPORT_FAILURE = /^(Not connected|Command ".*" timed out)$/;

function toCommandError(command: string, reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const text = typeof reason === "string" ? reason : reason == null ? "" : String(reason);
  if (/unknown\s*command/i.test(text)) return new UnsupportedCommandError(command);
  if (TRANSPORT_FAILURE.test(text)) return new Error(text);
  return new CommandFailedError(command, text || `${command} failed`);
}

const VARIABLE_KINDS = ["number", "boolean", "string", "image", "list", "computed"] as const;
const ELEMENT_TYPES  = ["Number", "Boolean", "Point", "Record"] as const;

type WireRecord = Record<string, unknown>;

/** Arrays may arrive as JSON strings, the way GetBuiltPrograms sends its list. */
function wireArray(v: unknown): WireRecord[] {
  let parsed = v;
  if (typeof v === "string") {
    try { parsed = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(parsed)
    ? parsed.filter((x): x is WireRecord => !!x && typeof x === "object")
    : [];
}

function isNamed(r: WireRecord): r is WireRecord & { name: string } {
  return typeof r.name === "string" && r.name.length > 0;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Symbols are stored without their `$` whichever way the controller spells them. */
const stripSigil = (name: string): string => name.replace(/^\$/, "");

function normalizeProblem(r: WireRecord): ValidationProblem | null {
  const message = str(r.message);
  if (!message) return null;
  // The contract does not pin stepPath's shape; accept a string or an array of segments.
  const path = Array.isArray(r.stepPath) ? r.stepPath.map(String).join(" › ") : str(r.stepPath);
  return {
    stepId:   r.stepId == null ? "" : String(r.stepId),
    stepPath: path,
    field:    str(r.field) || undefined,
    severity: r.severity === "warning" ? "warning" : "error",
    code:     str(r.code),
    message,
  };
}

function wireProgram(v: unknown, fallbackName: string): BuiltProgram {
  let parsed = v;
  if (typeof v === "string") {
    try { parsed = JSON.parse(v); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The controller returned no program");
  const p = parsed as Partial<BuiltProgram>;
  return {
    ...p,
    name:              p.name ?? fallbackName,
    description:       p.description ?? "",
    steps:             Array.isArray(p.steps) ? p.steps : [],
    lastUpdatedUnixMs: p.lastUpdatedUnixMs ?? Date.now(),
  };
}

// ── Wire helpers for the calibration commands ────────────────────────────────

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const strArray = (v: unknown): string[] => {
  const parsed = parseMaybeJson(v);
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
};

/** Objects may arrive as JSON strings, the way GetCameras sends its list. */
function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

function wirePoint(v: unknown): CalibrationRobotPoint | null {
  if (!v || typeof v !== "object") return null;
  const r = v as WireRecord;
  return { x: num(r.x), y: num(r.y), z: num(r.z) };
}

function wireMatrix(v: unknown): Matrix3 {
  const rows = Array.isArray(v) ? v : [];
  const row = (k: number): [number, number, number] => {
    const r = Array.isArray(rows[k]) ? (rows[k] as unknown[]) : [];
    return [num(r[0], k === 0 ? 1 : 0), num(r[1], k === 1 ? 1 : 0), num(r[2], k === 2 ? 1 : 0)];
  };
  return [row(0), row(1), row(2)];
}

function wireTaught(v: unknown): CalibrationTaughtDot[] {
  return wireArray(v).map(t => ({
    dotIndex: num(t.dotIndex, -1),
    i:        num(t.i),
    j:        num(t.j),
    robot:    wirePoint(t.robot) ?? { x: 0, y: 0, z: 0 },
  })).filter(t => t.dotIndex >= 0);
}

function detectParams(o: CalibrationDetectOptions): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (o.minDotAreaPx !== undefined) p.minDotAreaPx = o.minDotAreaPx;
  if (o.maxDotAreaPx !== undefined) p.maxDotAreaPx = o.maxDotAreaPx;
  if (o.darkDots !== undefined) p.darkDots = o.darkDots;
  return p;
}

function wireSession(ack: WireRecord, fallbackSessionId = ""): CalibrationSession {
  const sessionId = str(ack.sessionId) || fallbackSessionId;
  return {
    sessionId,
    imageWidth:  num(ack.imageWidth),
    imageHeight: num(ack.imageHeight),
    dots: wireArray(ack.dots).map(d => ({
      index: num(d.index), i: num(d.i), j: num(d.j), u: num(d.u), v: num(d.v), areaPx: num(d.areaPx),
    })),
    gridRows:  num(ack.gridRows),
    gridCols:  num(ack.gridCols),
    gridRmsPx: num(ack.gridRmsPx),
    warnings:  strArray(ack.warnings),
    imageUrl:  str(ack.imageUrl) || `/calibration/${sessionId}/image`,
    taught:    ack.taught === undefined ? undefined : wireTaught(ack.taught),
  };
}

function wireCalibration(v: unknown): CameraCalibration | null {
  const parsed = parseMaybeJson(v);
  if (!parsed || typeof parsed !== "object") return null;
  const c = parsed as WireRecord;
  const s2r = (c.sheetToRobot && typeof c.sheetToRobot === "object" ? c.sheetToRobot : {}) as WireRecord;
  return {
    cameraId:     str(c.cameraId),
    imageWidth:   num(c.imageWidth),
    imageHeight:  num(c.imageHeight),
    dotPitchMm:   num(c.dotPitchMm),
    pixelToSheet: wireMatrix(c.pixelToSheet),
    sheetToRobot: { cos: num(s2r.cos, 1), sin: num(s2r.sin), tx: num(s2r.tx), ty: num(s2r.ty) },
    pixelToRobot: wireMatrix(c.pixelToRobot),
    planeZ:       num(c.planeZ),
    taughtDots: wireArray(c.taughtDots).map(t => ({
      i: num(t.i), j: num(t.j), u: num(t.u), v: num(t.v),
      robot: wirePoint(t.robot) ?? { x: 0, y: 0, z: 0 },
      residualMm: t.residualMm === undefined ? undefined : num(t.residualMm),
    })),
    gridRows:           num(c.gridRows),
    gridCols:           num(c.gridCols),
    dotCount:           num(c.dotCount),
    gridRmsPx:          num(c.gridRmsPx),
    taughtRmsMm:        num(c.taughtRmsMm),
    taughtMaxMm:        num(c.taughtMaxMm),
    pitchScaleEstimate: num(c.pitchScaleEstimate, 1),
    mirrored:           c.mirrored === true,
    activeTool:         str(c.activeTool),
    calibratedUnixMs:   num(c.calibratedUnixMs),
  };
}


export const robotClient = new RobotConnectService()
// ── Network camera source params (docs/network-cameras.md) ──────────────────

type CameraSourceParams = {
  sourceType?: CameraSourceType;
  url?: string;
  username?: string;
  password?: string;
  transport?: CameraTransport;
  // ── Sofia / DVRIP (XMeye) cameras ──
  host?: string;
  port?: number;
  stream?: CameraStream;
  codec?: CameraCodec;
  decoder?: CameraDecoder;
  ffmpegPath?: string;
  hwaccel?: string;
};

/** Only the fields that were given, so a plain USB add/save stays exactly as before. */
function cameraSourceParams(p: CameraSourceParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.sourceType  !== undefined) out.sourceType  = p.sourceType;
  if (p.url         !== undefined) out.url         = p.url;
  if (p.username    !== undefined) out.username    = p.username;
  if (p.password    !== undefined) out.password    = p.password;
  if (p.transport   !== undefined) out.transport   = p.transport;
  if (p.host        !== undefined) out.host        = p.host;
  if (p.port        !== undefined) out.port        = p.port;
  if (p.stream      !== undefined) out.stream      = p.stream;
  if (p.codec       !== undefined) out.codec       = p.codec;
  if (p.decoder     !== undefined) out.decoder     = p.decoder;
  if (p.ffmpegPath  !== undefined) out.ffmpegPath  = p.ffmpegPath;
  if (p.hwaccel     !== undefined) out.hwaccel     = p.hwaccel;
  return out;
}
