import { subscribeRobot } from "./robotState"


type MessageHandler<T = any> = (data: T) => void;

type PendingAck = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

export class RobotWebSocketClient {
  private ws: WebSocket | null = null;
  private url?: string;
  private reconnect: boolean;
  private reconnectIntervalMs: number;
  private unsubscribe?: () => void;

  private messageHandlers: MessageHandler[] = [];
  private isConnected = false;

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
      this.url = `ws://${robot.ip}:${robot.port}/control`;
      console.log("Found Robot ip and port, updated the url point: ", this.url);
      this.connect();
    })
  }

  connect() {
    // Validate there is a url
    if (!this.url) return;

    // Already a websocket connected need to close it first to reconnect
    if (this.ws) return;

    console.log("[RobotWS] Connecting to", this.url);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[RobotWS] Connected");
      this.isConnected = true;
    };

    this.ws.onclose = () => {
      console.log("[RobotWS] Disconnected");
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
        const pending = this.pendingAcks.get(data.id);
        if (pending) {
          this.pendingAcks.delete(data.id);
          pending.resolve(data);
          return;
        }
      }

      // Forward everything else
      this.messageHandlers.forEach((cb) => cb(data));
    };
  }

  disconnect() {
    this.reconnect = false;
    this.ws?.close();
    this.cleanup();
  }

  private cleanup() {
    this.ws = null;
    this.isConnected = false;

    // Reject all pending commands
    for (const [, pending] of this.pendingAcks) {
      pending.reject("Disconnected");
    }
    this.pendingAcks.clear();
  }

  // -------------------------
  // Messaging
  // -------------------------

  send<T extends object>(data: T) {
    if (!this.ws || !this.isConnected) {
      console.warn("[RobotWS] Not connected, cannot send");
      this.connect();
      return;
    }

    this.ws.send(JSON.stringify(data));
  }

  // ⭐ Python-equivalent send_command ⭐
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

  get connected() {
    return this.isConnected;
  }
}


export const robotClient = new RobotWebSocketClient()