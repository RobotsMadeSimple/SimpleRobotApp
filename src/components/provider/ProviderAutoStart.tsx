import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { getAssignedDevice } from "@/src/services/phoneIdentity";

/**
 * On app launch, if THIS phone is assigned to provide for a device, take the user straight to the
 * provider screen — which then resumes the stream (restoring camOn from the saved config) with the
 * camera-permission lifecycle it owns, and clearly shows which robot it's serving. So a dedicated
 * provider phone comes back up streaming with no re-navigating or re-toggling. We only navigate here
 * (not open the engine directly) so the camera isn't opened before the app/screen is ready. Runs
 * once, only for an assigned phone. Native-only; web renders the no-op stub.
 */
export function ProviderAutoStart() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const assigned = await getAssignedDevice();
      if (!assigned) return;
      router.replace({ pathname: "/(tabs)/io/phone-provider", params: { deviceId: assigned.id, name: assigned.name } });
    })();
  }, []);
  return null;
}
