import { RobotInfo } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { createContext, useContext, useEffect, useState } from "react";

type RobotContextType = {
  robots: RobotInfo[];
};

const RobotContext = createContext<RobotContextType>({
  robots: [],
});

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [robots, setRobots] = useState<RobotInfo[]>([]);

  useEffect(() => {
    const unsubscribe = robotDiscovery.subscribe(setRobots);

    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubscribe();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, []);

  return (
    <RobotContext.Provider value={{ robots }}>
      {children}
    </RobotContext.Provider>
  );
}

export function useRobots() {
  return useContext(RobotContext);
}
