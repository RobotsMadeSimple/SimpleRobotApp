import { Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import { RobotInfo } from '../models/robotModels';


class RobotDiscoveryService {
  private zeroconf = new Zeroconf();
  private robots = new Map<string, RobotInfo>();
  private listeners: ((robots: RobotInfo[]) => void)[] = [];

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
        console.log(`New Robot Service: ${service.host} ${service.txt}`);
        const robot: RobotInfo = {
          robotName: service.txt.RobotName,
          ipAddress: service.host,
          port: service.port,
          robotType: service.txt.RobotType,
          controlEndpoint: service.txt.ControlEndpoint,
          serialNumber: service.txt.SerialNumber
        };

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
    try {
      const res = await fetch('http://localhost:3001/get-robots');
      if (!res.ok) return;
      const data = await res.json();
      for (const r of data) {
        this.robots.set(r.robotName, r as RobotInfo);
      }
      this.emit();
    } catch {}
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

  updateRobot(serialNumber: string, fields: Partial<RobotInfo>) {
    for (const [key, robot] of this.robots) {
      if (robot.serialNumber === serialNumber) {
        const updated = { ...robot, ...fields };
        this.robots.delete(key);
        this.robots.set(fields.serialNumber ?? key, updated);
        this.emit();
        break;
      }
    }
  }

  subscribe(callback: (robots: RobotInfo[]) => void) {
    this.listeners.push(callback);
    callback([...this.robots.values()]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit() {
    const list = [...this.robots.values()];
    this.listeners.forEach(callback => callback(list));
  }
}

export const robotDiscovery = new RobotDiscoveryService();
