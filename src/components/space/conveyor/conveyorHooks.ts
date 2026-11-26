import { appAlert } from "@/src/components/ui/AppAlert";
import type { AuxDeviceState } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { useEffect, useState } from "react";

/** Aux devices (and their axes), loaded once on mount and kept current. */
export function useAuxDevices(): AuxDeviceState[] {
  const [devices, setDevices] = useState<AuxDeviceState[]>([]);
  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    return robotClient.onAuxAxis(setDevices);
  }, []);
  return devices;
}

/** Text for a failed conveyor command. */
export function conveyorErrorText(e: unknown): string {
  if (isUnsupportedCommand(e)) return "This controller doesn't have conveyor tracking yet. Update the controller to use it.";
  if (e instanceof Error) return e.message;
  return typeof e === "string" && e ? e : "The command failed.";
}

/** Run a conveyor command; a failure shows an alert instead of throwing. Resolves undefined on failure. */
export async function runConveyorCommand<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    appAlert(title, conveyorErrorText(e));
    return undefined;
  }
}
