import { subscribeRobot } from "../connections/robotState";
import { Point, RobotInfo, RobotStatus, createDefaultStatus } from "../models/robotModels";
type MessageHandler<T = any> = (data: T) => void;
type StatusListener = (status: RobotStatus) => void;
type PointsListener = (points: Point[]) => void;
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
  private statusListeners: StatusListener[] = [];
  private pointsListeners: PointsListener[] = [];
  private status: RobotStatus = createDefaultStatus();
  private connecting: boolean = false;
  private points: Point[] = [];

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
        
        this.emitStatus(data);
        break;
      
      case "GetPoints":
        console.log("GetPoints Decode");
        this.decodePoints(data);
        break;
    }

    this.pendingAcks.delete(data.id);
    pending.resolve(data);
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

    console.log(this.points);
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
    const previousUpdate = this.status.lastPointUpdate;

    this.status = { ...this.status, ...update };

    if (
      update.lastPointUpdate !== previousUpdate
    ) {
      this.getPoints().catch(() => {});
    }

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
      this.pendingAcks.set(id, { resolve, reject });
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

  public getStatus(){
    return robotClient.sendCommand("GetStatus");
  }

  public getPoints(){
    return robotClient.sendCommand("GetPoints");
  }

  public stopJog(){
    return robotClient.sendCommand("StopJog");
  }

  public jogL({
    x = 0,
    y = 0,
    z = 0,
    rz = 0,
    speed = 100,
    accel = 100,
    decel = 100
  }: MoveParams) {

    return robotClient.sendCommand("JogL", {
      X: x,
      Y: y,
      Z: z,
      RZ: rz,
      Speed: speed,
      Accel: accel,
      Decel: decel
    });
  }

  public jogJ({
    x = 0,
    y = 0,
    z = 0,
    rz = 0,
    speed = 100,
    accel = 100,
    decel = 100
  }: MoveParams) {

    return robotClient.sendCommand("JogJ", {
      X: x,
      Y: y,
      Z: z,
      RZ: rz,
      Speed: speed,
      Accel: accel,
      Decel: decel
    });
  }

  public jogTool({
    x = 0,
    y = 0,
    z = 0,
    rz = 0,
    speed = 100,
    accel = 100,
    decel = 100
  }: MoveParams) {

    return robotClient.sendCommand("JogTool", {
      X: x,
      Y: y,
      Z: z,
      RZ: rz,
      Speed: speed,
      Accel: accel,
      Decel: decel
    });
  }

  public offsetL({
    x = 0,
    y = 0,
    z = 0,
    rz = 0,
    speed = 100,
    accel = 100,
    decel = 100
  }: MoveParams) {

    return robotClient.sendCommand("OffsetL", {
      X: x,
      Y: y,
      Z: z,
      RZ: rz,
      Speed: speed,
      Accel: accel,
      Decel: decel
    });
  }
}


export const robotClient = new RobotConnectService()