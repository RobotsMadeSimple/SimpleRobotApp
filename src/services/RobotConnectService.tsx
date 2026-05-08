import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "../connections/robotState";
import { BuiltProgram, NanoState, NeoPixelColor, Point, ProgramStatus, RobotInfo, RobotStatus, Tool, UsbRelayState, createDefaultStatus } from "../models/robotModels";
type MessageHandler<T = any>  = (data: T) => void;
type StatusListener           = (status: RobotStatus)                    => void;
type PointsListener           = (points: Point[])                        => void;
type ToolsListener            = (tools: Tool[])                          => void;
type BuiltProgramsListener    = (programs: BuiltProgram[])               => void;
type NanoIOListener           = (nanos: NanoState[])                     => void;
type RelayIOListener          = (relay: UsbRelayState | null)            => void;
type ProgramImagesListener    = (images: Record<string, string | null>)  => void;
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
  private builtProgramsListeners:  BuiltProgramsListener[]  = [];
  private nanoIOListeners:         NanoIOListener[]         = [];
  private relayIOListeners:        RelayIOListener[]        = [];
  private programImagesListeners:  ProgramImagesListener[]  = [];
  private status:       RobotStatus        = createDefaultStatus();
  private connecting:   boolean            = false;
  private points:       Point[]            = [];
  private tools:        Tool[]             = [];
  private builtPrograms:  BuiltProgram[]                = [];
  private nanoIO:         NanoState[]                   = [];
  private relayIO:        UsbRelayState | null          = null;
  private programImages:  Record<string, string | null> = {};

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
      this.getBuiltPrograms().catch(() => {});
      this.getIO().catch(() => {});
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
        this.emitStatus(data);
        break;
      
      case "GetPoints":
        console.log("GetPoints Decode");
        this.decodePoints(data);
        break;

      case "GetTools":
        this.decodeTools(data);
        break;

      case "GetBuiltPrograms":
        this.decodeBuiltPrograms(data);
        break;

      case "GetIO":
        this.decodeIO(data);
        break;
    }

    this.pendingAcks.delete(data.id);
    pending.resolve(data);
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
    if (update.lastBuiltProgramUpdate !== undefined && update.lastBuiltProgramUpdate !== prev.lastBuiltProgramUpdate) this.getBuiltPrograms().catch(() => {});

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
      a.moving          === b.moving          &&
      a.wasHomed        === b.wasHomed        &&
      a.driverConnected === b.driverConnected &&
      a.homingState     === b.homingState     &&
      a.activeTool      === b.activeTool      &&
      a.lastPointUpdate        === b.lastPointUpdate        &&
      a.lastToolUpdate         === b.lastToolUpdate         &&
      a.lastBuiltProgramUpdate === b.lastBuiltProgramUpdate &&
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
      JSON.stringify(a.programs) === JSON.stringify(b.programs)
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
      name:        program.name,
      description: program.description,
      steps:       program.steps,
      variables:   program.variables,
      isRoutine:   program.isRoutine ?? false,
    });
  }

  public deleteBuiltProgram(name: string) {
    return this.sendCommand("DeleteBuiltProgram", { name });
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

  public getRobotConfig(): Promise<{
    homingSpeed: number;
    j1HomeOffsetDeg: number;
    verticalHomePosition: number;
    horizontalHomePosition: number;
    verticalHomingDirection: number;
    horizontalHomingDirection: number;
    j1HomingDirection: number;
    j4HomeOffsetDeg: number;
    enableStbCard: boolean;
    enableNanoCards: boolean;
    enableRelayCard: boolean;
  }> {
    return this.sendCommand("GetRobotConfig") as any;
  }

  public setRobotConfig(fields: {
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
  }) {
    return this.sendCommand("SetRobotConfig", fields);
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
}


export const robotClient = new RobotConnectService()