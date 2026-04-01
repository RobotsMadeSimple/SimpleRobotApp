import { subscribeRobot } from "../connections/robotState";
import { BuiltProgram, NanoState, NeoPixelColor, Point, ProgramStatus, RobotInfo, RobotStatus, Tool, createDefaultStatus } from "../models/robotModels";
type MessageHandler<T = any>  = (data: T) => void;
type StatusListener           = (status: RobotStatus)      => void;
type PointsListener           = (points: Point[])          => void;
type ToolsListener            = (tools: Tool[])            => void;
type BuiltProgramsListener    = (programs: BuiltProgram[]) => void;
type NanoIOListener           = (nanos: NanoState[])       => void;
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
  private builtProgramsListeners: BuiltProgramsListener[] = [];
  private nanoIOListeners:        NanoIOListener[]        = [];
  private status:       RobotStatus    = createDefaultStatus();
  private connecting:   boolean        = false;
  private points:       Point[]        = [];
  private tools:        Tool[]         = [];
  private builtPrograms: BuiltProgram[] = [];
  private nanoIO:       NanoState[]    = [];

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
        this.decodeNanoIO(data);
        break;
    }

    this.pendingAcks.delete(data.id);
    pending.resolve(data);
  }

  private decodeNanoIO(data: any) {
    if (!data.nanos) { this.nanoIO = []; this.emitNanoIO(); return; }

    let parsed: any[];
    try { parsed = JSON.parse(data.nanos); }
    catch { this.nanoIO = []; this.emitNanoIO(); return; }

    if (!Array.isArray(parsed)) { this.nanoIO = []; this.emitNanoIO(); return; }

    this.nanoIO = parsed as NanoState[];
    this.emitNanoIO();
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

    this.status = { ...prev, ...update };
    this.statusListeners.forEach(cb => cb(this.status));
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
    }, 40);
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
    return data?.images ?? {};
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
    });
  }

  public deleteBuiltProgram(name: string) {
    return this.sendCommand("DeleteBuiltProgram", { name });
  }

  public saveProgramImage(name: string, imageBase64: string) {
    return this.sendCommand("SaveBuiltProgramImage", { name, image: imageBase64 });
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
}


export const robotClient = new RobotConnectService()