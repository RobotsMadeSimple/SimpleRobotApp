import { Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import { RobotInfo } from '../models/robotModels';
import { pickReachable, rankAddresses } from './addressPick';
import { knownAddresses } from './connectionStore';

/** How long a working address is trusted before re-probing on the next announcement. */
const REPROBE_MS = 60_000;

type Pick = { key: string; ip: string | null; at: number; probing: string | null };

class RobotDiscoveryService {
  private zeroconf: Zeroconf | null = (() => {
    try { return new Zeroconf(); } catch { return null; }
  })();
  private robots = new Map<string, RobotInfo>();
  /** Per service: the candidate set last probed and the address that answered. */
  private picks = new Map<string, Pick>();
  private listeners: ((robots: RobotInfo[]) => void)[] = [];

  private started = false;
  private listenersRegistered = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async start() {
    if (Platform.OS === 'web') {
      await this.fetchFromHttp();
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => this.fetchFromHttp(), 5000);
      }
      return;
    }

    if (!this.zeroconf) return;

    if (this.started) return;
    this.started = true;

    try {
      if (!this.listenersRegistered) {
        this.listenersRegistered = true;

        this.zeroconf.on('resolved', (service: any) => { this.onResolved(service); });

        this.zeroconf.on('remove', (service: any) => {
          this.robots.delete(service.name);
          this.picks.delete(service.name);
          this.emit();
        });
      }

      this.zeroconf.scan('robot', 'tcp', 'local.');
    } catch {
      // Native mDNS module unavailable (e.g. Expo Go) — discovery disabled
      this.started = false;
    }
  }

  /**
   * A controller with several adapters publishes several addresses, and the resolver passes on just one
   * (often a VPN or virtual-switch one the phone can't reach). Collect every candidate — the controller's
   * `Addresses` TXT list, addresses this robot answered on before, and the resolver's — probe them, and
   * list the robot under the best one that answers. Services re-announce every few seconds, so a
   * probe only reruns when the candidates change or the last pick has gone stale.
   */
  private async onResolved(service: any) {
    const txt = service.txt ?? {};
    const port = Number(service.port);
    const known = await knownAddresses(String(txt.SerialNumber ?? ''));
    const candidates = rankAddresses(txt.Addresses, [...known, ...(service.addresses ?? []), service.host]);
    const key = `${port}|${candidates.join(',')}`;

    const prev = this.picks.get(service.name);
    const fresh = prev && prev.key === key && Date.now() - prev.at < REPROBE_MS;
    const guess = prev?.key === key && prev.ip ? prev.ip : candidates[0] ?? service.host;
    this.publishRobot(service, guess);
    if (fresh || prev?.probing === key) return;

    this.picks.set(service.name, { key, ip: prev?.key === key ? prev.ip : null, at: prev?.at ?? 0, probing: key });
    const ip = await pickReachable(candidates, port);
    const cur = this.picks.get(service.name);
    if (!cur || cur.probing !== key) return;   // removed or superseded meanwhile
    this.picks.set(service.name, { key, ip, at: Date.now(), probing: null });
    if (ip && this.robots.has(service.name)) this.publishRobot(service, ip);
  }

  private publishRobot(service: any, ipAddress: string) {
    const txt = service.txt ?? {};
    const robot: RobotInfo = {
      robotName: txt.RobotName,
      ipAddress,
      port: service.port,
      robotType: txt.RobotType,
      controlEndpoint: txt.ControlEndpoint,
      serialNumber: txt.SerialNumber
    };
    const prev = this.robots.get(service.name);
    if (prev && JSON.stringify(prev) === JSON.stringify(robot)) return;
    this.robots.set(service.name, robot);
    this.emit();
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
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.robots.clear();
      this.emit();
      return;
    }

    if (!this.started) return;

    this.started = false;
    try { this.zeroconf?.stop(); } catch {}
    this.robots.clear();
    this.picks.clear();
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

  /** The discovered robot with this serial, if it's currently advertising. */
  find(serialNumber: string): RobotInfo | undefined {
    for (const r of this.robots.values()) if (r.serialNumber === serialNumber) return r;
    return undefined;
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
