import { getSelectedRobot, setSelectedRobot } from "../connections/robotState";
import type { RobotInfo } from "../models/robotModels";
import { pickReachableEndpoint } from "./addressPick";
import { knownEndpoints, recordConnection } from "./connectionStore";
import { robotClient } from "./RobotConnectService";
import { robotDiscovery } from "./RobotDiscoveryService";

// Connecting to a robot the app may know on several addresses (a starred or recent robot, a station
// tag, a discovered robot). The robot is identified by its serial; the address is picked here.

let attempt = 0;

function go(entry: RobotInfo) {
  // A saved/recent entry carries its address list; the selected robot is just the one in use.
  const { addresses: _addresses, ...robot } = entry as RobotInfo & { addresses?: unknown };
  recordConnection(entry);
  setSelectedRobot(robot);
  robotClient.connectTo(robot);
}

/**
 * Connect to `robot`. With `exact`, use exactly its address (the user picked or typed it).
 * Otherwise: a robot discovery currently sees is used at the address discovery already probed;
 * a robot known on one address connects straight away; one known on several connects to the best
 * guess at once while every known address is probed, and switches to the best one that answers if
 * the guess hasn't connected by then.
 */
export async function connectToRobot(robot: RobotInfo, opts: { exact?: boolean } = {}): Promise<void> {
  const serial = robot.serialNumber?.trim();
  const live = !opts.exact && serial ? robotDiscovery.find(serial) : undefined;
  if (opts.exact || live) {
    go(live ? { ...robot, ...live, robotName: live.robotName || robot.robotName } : robot);
    return;
  }

  const endpoints = await knownEndpoints(robot);
  const first = endpoints[0] ?? { host: robot.ipAddress, port: robot.port };
  const my = ++attempt;
  go({ ...robot, ipAddress: first.host, port: first.port });
  if (endpoints.length <= 1) return;

  const best = await pickReachableEndpoint(endpoints);
  // Superseded by another connect, already up on the guess, or nothing better answered.
  if (my !== attempt || robotClient.connected || !best) return;
  if (best.host === first.host && best.port === first.port) return;
  const cur = getSelectedRobot();
  if (!cur || cur.ipAddress !== first.host || cur.port !== first.port) return;
  console.log("[connect] Using", `${best.host}:${best.port}`, "— the first address didn't answer");
  go({ ...cur, ipAddress: best.host, port: best.port });
}
