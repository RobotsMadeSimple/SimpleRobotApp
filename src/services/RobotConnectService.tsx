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

export class RobotConnectService {
  private statusListeners:        StatusListener[]        = [];
  private pointsListeners:        PointsListener[]        = [];
  private toolsListeners:         ToolsListener[]         = [];
  private localsListeners:        LocalsListener[]        = [];
  private builtProgramsListeners:  BuiltProgramsListener[]  = [];
  private nanoIOListeners:         NanoIOListener[]         = [];
  private relayIOListeners:        RelayIOListener[]        = [];
  private auxAxisListeners:        AuxAxisListener[]        = [];
  private camerasListeners:        CamerasListener[]        = [];
  private programImagesListeners:  ProgramImagesListener[]  = [];
  private gridsListeners:          GridsListener[]           = [];
  private stacksListeners:         StacksListener[]          = [];
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
    if (!data.points) {
      this.points = [];
      return;
    }

    let parsed: any[];

    try {
      parsed = JSON.parse(data.points);
    } catch {
      console.warn("[RobotWS] Failed to parse points JSON");
      this.points = [];
      return;
    }

    if (!Array.isArray(parsed)) {
      this.points = [];
      return;
    }

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
    return (
      a.connected       === b.connected       &&
      a.version         === b.version         &&
      a.moving          === b.moving          &&
      a.wasHomed        === b.wasHomed        &&
      a.driverConnected === b.driverConnected &&
      a.driverOk        === b.driverOk        &&
      a.homingState     === b.homingState     &&
      a.activeTool      === b.activeTool      &&
      a.activeLocal     === b.activeLocal     &&
      a.lastPointUpdate        === b.lastPointUpdate        &&
      a.lastToolUpdate         === b.lastToolUpdate         &&
      a.lastLocalUpdate        === b.lastLocalUpdate        &&
      a.lastBuiltProgramUpdate === b.lastBuiltProgramUpdate &&
      a.lastGridUpdate         === b.lastGridUpdate         &&
      a.lastStackUpdate        === b.lastStackUpdate        &&
      a.joint1Angle === b.joint1Angle && a.joint2X === b.joint2X &&
      a.joint2Z     === b.joint2Z     && a.joint4Angle === b.joint4Angle &&
      a.x  === b.x  && a.y  === b.y  && a.z  === b.z  &&
      a.rx === b.rx && a.ry === b.ry && a.rz === b.rz &&
      a.targetX  === b.targetX  && a.targetY  === b.targetY  && a.targetZ  === b.targetZ  &&
      a.targetRx === b.targetRx && a.targetRy === b.targetRy && a.targetRz === b.targetRz &&
      a.poseX  === b.poseX  && a.poseY  === b.poseY  && a.poseZ  === b.poseZ  &&
      a.poseRx === b.poseRx && a.poseRy === b.poseRy && a.poseRz === b.poseRz &&
      a.speedS === b.speedS && a.accelS === b.accelS && a.decelS === b.decelS &&
      a.speedJ === b.speedJ && a.accelJ === b.accelJ && a.decelJ === b.decelJ &&
      a.input1 === b.input1 && a.input2 === b.input2 &&
      a.input3 === b.input3 && a.input4 === b.input4 &&
      a.output1 === b.output1 && a.output2 === b.output2 &&
      a.output3 === b.output3 && a.output4 === b.output4 &&
      JSON.stringify(a.programs) === JSON.stringify(b.programs) &&
      JSON.stringify(a.backgroundPrograms) === JSON.stringify(b.backgroundPrograms) &&
      a.speedOverridePercent === b.speedOverridePercent
    );
  }

  onPoints(cb: PointsListener) {
    this.pointsListeners.push(cb);
    cb(this.points);
    return () => {
      this.pointsListeners = this.pointsListeners.filter(l => l !== cb);
    };
  }

  private emitPoints() {
    this.pointsListeners.forEach(cb => cb(this.points));
  }

  onTools(cb: ToolsListener) {
    this.toolsListeners.push(cb);
    cb(this.tools);
    return () => {
      this.toolsListeners = this.toolsListeners.filter(l => l !== cb);
    };
  }

  private emitTools() {
    this.toolsListeners.forEach(cb => cb(this.tools));
  }

  onLocals(cb: LocalsListener) {
    this.localsListeners.push(cb);
    cb(this.locals);
    return () => {
      this.localsListeners = this.localsListeners.filter(l => l !== cb);
    };
  }

  private emitLocals() {
    this.localsListeners.forEach(cb => cb(this.locals));
  }

  onBuiltPrograms(cb: BuiltProgramsListener) {
    this.builtProgramsListeners.push(cb);
    cb(this.builtPrograms);
    return () => {
      this.builtProgramsListeners = this.builtProgramsListeners.filter(l => l !== cb);
    };
  }

  private emitBuiltPrograms() {
    this.builtProgramsListeners.forEach(cb => cb(this.builtPrograms));
  }

  onProgramImages(cb: ProgramImagesListener) {
    this.programImagesListeners.push(cb);
    cb(this.programImages);
    return () => {
      this.programImagesListeners = this.programImagesListeners.filter(l => l !== cb);
    };
  }

  private emitProgramImages() {
    this.programImagesListeners.forEach(cb => cb(this.programImages));
  }

  onNanoIO(cb: NanoIOListener) {
    this.nanoIOListeners.push(cb);
    cb(this.nanoIO);
    return () => {
      this.nanoIOListeners = this.nanoIOListeners.filter(l => l !== cb);
    };
  }

  private emitNanoIO() {
    this.nanoIOListeners.forEach(cb => cb(this.nanoIO));
  }

  onRelayIO(cb: RelayIOListener) {
    this.relayIOListeners.push(cb);
    cb(this.relayIO);
    return () => {
      this.relayIOListeners = this.relayIOListeners.filter(l => l !== cb);
    };
  }

  private emitRelayIO() {
    this.relayIOListeners.forEach(cb => cb(this.relayIO));
  }

  onAuxAxis(cb: AuxAxisListener) {
    this.auxAxisListeners.push(cb);
    cb(this.auxAxis);
    return () => {
      this.auxAxisListeners = this.auxAxisListeners.filter(l => l !== cb);
    };
  }

  private emitAuxAxis() {
    this.auxAxisListeners.forEach(cb => cb(this.auxAxis));
  }

  onCameras(cb: CamerasListener) {
    this.camerasListeners.push(cb);
    cb(this.cameras);
    return () => {
      this.camerasListeners = this.camerasListeners.filter(l => l !== cb);
    };
  }

  private emitCameras() {
    this.camerasListeners.forEach(cb => cb(this.cameras));
  }

  onGrids(cb: GridsListener) {
    this.gridsListeners.push(cb);
    cb(this.grids);
    return () => {
      this.gridsListeners = this.gridsListeners.filter(l => l !== cb);
    };
  }

  private emitGrids() {
    this.gridsListeners.forEach(cb => cb(this.grids));
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
    this.stacksListeners.push(cb);
    cb(this.stacks);
    return () => {
      this.stacksListeners = this.stacksListeners.filter(l => l !== cb);
    };
  }

  private emitStacks() {
    this.stacksListeners.forEach(cb => cb(this.stacks));
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

  sendCommand(command: string, params: Record<string, any> = {}) {
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
      }, 10000);

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