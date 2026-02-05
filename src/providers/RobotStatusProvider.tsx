import { robotClient } from '@/src/connections/RobotWebSocketClient';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { RobotStatus } from '../models/robotModels';

const RobotStatusContext = createContext<RobotStatus | null>(null);

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RobotStatus>({
    connected: false,
    moving: false,
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    targetRx: 0,
    targetRy: 0,
    targetRz: 0,
    poseX: 0,
    poseY: 0,
    poseZ: 0,
    poseRx: 0,
    poseRy: 0,
    poseRz: 0,
    speedS: 0,
    accelS: 0,
    decelS: 0,
    speedJ: 0,
    accelJ: 0,
    decelJ: 0
  });

  useEffect(() => {
    return robotClient.onStatus(setStatus);
  }, []);

  return (
    <RobotStatusContext.Provider value={status}>
      {children}
    </RobotStatusContext.Provider>
  );
}

export function useRobotStatus() {
  const ctx = useContext(RobotStatusContext);
  if (!ctx) throw new Error("useRobotStatus must be inside RobotProvider");
  return ctx;
}
