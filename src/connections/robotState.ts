import { RobotInfo } from "../models/robotModels";

const STORAGE_KEY = "rms_selected_robot";

type Listener = (robot: RobotInfo | null) => void

function loadPersistedRobot(): RobotInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RobotInfo) : null;
  } catch {
    return null;
  }
}

let selectedRobot: RobotInfo | null = loadPersistedRobot();
const listeners = new Set<Listener>();

export function setSelectedRobot(robot: RobotInfo | null) {
  selectedRobot = robot;
  try {
    if (robot) localStorage.setItem(STORAGE_KEY, JSON.stringify(robot));
    else        localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach(l => l(robot));
}

export function getSelectedRobot() {
  return selectedRobot;
}

export function subscribeRobot(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
