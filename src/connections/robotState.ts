// robotState.ts
type RobotInfo = {
  ip: string
  port: number
}

type Listener = (robot: RobotInfo | null) => void

let selectedRobot: RobotInfo | null = null
const listeners = new Set<Listener>()

export function setSelectedRobot(robot: RobotInfo) {
  selectedRobot = robot
  listeners.forEach(l => l(robot))
}

export function getSelectedRobot() {
  return selectedRobot
}

export function subscribeRobot(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
