import Zeroconf from 'react-native-zeroconf';
import { setSelectedRobot } from "./robotState";
import { Platform } from 'react-native';

export type RobotService = {
  name: string;
  host: string;
  port: number;
  type: string;
  txt: Record<string, string>;
};

type WebRobotResponse = {
  ready: boolean;
  name: string;
  ip: string;
  port: number;
  type: string;
  control_endpoint: string;
  properties: Record<string, string>;
};

class RobotDiscoveryService {
  private zeroconf = new Zeroconf();
  private robots = new Map<string, RobotService>();
  private listeners: ((robots: RobotService[]) => void)[] = [];

  private started = false;
  private listenersRegistered = false;

  async start() {
    if (Platform.OS === 'web') {
      await this.fetchFromHttp();
      return;
    }

    if (this.started) return;
    this.started = true;

    if (!this.listenersRegistered) {
      this.listenersRegistered = true;

      this.zeroconf.on('resolved', service => {
        const robot: RobotService = {
          name: service.name,
          host: service.host,
          port: service.port,
          type: service.type,
          txt: service.txt ?? {},
        };

        setSelectedRobot({ ip: service.host, port: service.port });
        this.robots.set(service.name, robot);
        this.emit();
      });

      this.zeroconf.on('remove', service => {
        this.robots.delete(service.name);
        this.emit();
      });
    }

    this.zeroconf.scan('robot', 'tcp', 'local.');
  }

  private async fetchFromHttp() {
    const res = await fetch('http://localhost:3001/robot');
    if (!res.ok) return;

    const data: WebRobotResponse = await res.json();
    if (!data.ready) return;

    const robot: RobotService = {
      name: data.name,
      host: data.ip,
      port: data.port,
      type: data.type,
      txt: data.properties ?? {},
    };

    setSelectedRobot({ ip: data.ip, port: data.port });
    this.robots.set(data.name, robot);
    this.emit();
  }

  stop() {
    if (Platform.OS === 'web') {
      this.robots.clear();
      this.emit();
      return;
    }

    if (!this.started) return;

    this.started = false;
    this.zeroconf.stop();
    this.robots.clear();
    this.emit();
  }

  subscribe(cb: (robots: RobotService[]) => void) {
    this.listeners.push(cb);
    cb([...this.robots.values()]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private emit() {
    const list = [...this.robots.values()];
    this.listeners.forEach(cb => cb(list));
  }
}

export const robotDiscovery = new RobotDiscoveryService();
