import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { useConnected } from "@/src/providers/RobotProvider";
import { ensurePhoneIdentity, getAssignedDevice, setAssignedDeviceId } from "@/src/services/phoneIdentity";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * If THIS phone is assigned to provide for a device, take the user straight to the provider screen —
 * which then resumes the stream (restoring camOn from the saved config) with the camera-permission
 * lifecycle it owns, and clearly shows which robot it's serving. So a dedicated provider phone comes
 * back up streaming with no re-navigating or re-toggling. We only navigate here (not open the engine
 * directly) so the camera isn't opened before the app/screen is ready. Native-only; web renders the
 * no-op stub.
 *
 * The phone's local "assigned device" note can go stale — the device may have been deleted, unlinked
 * or taken over by another phone from elsewhere — so it's checked against the controller (the source
 * of truth) on the first connection after launch before navigating. Until then the app opens on its
 * normal default page; a phone that's no longer the provider just stays there (and its stale note is
 * cleared). Runs once per launch, and only while the user is still on the landing page.
 */
export function ProviderAutoStart() {
  const connected = useConnected();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !connected) return;
    done.current = true;
    (async () => {
      const assigned = await getAssignedDevice();
      if (!assigned) return;
      try {
        const [me, devices] = await Promise.all([ensurePhoneIdentity(), robotClient.getDevices()]);
        const dev = devices.find(d => d.id === assigned.id);
        // Not on this controller (another robot, or deleted): don't navigate, but keep the note — it
        // may belong to a different controller.
        if (!dev) return;
        const cfg = dev.providerConfig ? JSON.parse(dev.providerConfig) as { assignedPhoneId?: string | null } : {};
        if (cfg.assignedPhoneId !== me.id) { await setAssignedDeviceId(null); return; }
      } catch { return; /* couldn't check — open normally */ }
      // Don't yank the user away if they've already gone somewhere (e.g. a station tag deep link).
      if (pathRef.current !== "/robot" && pathRef.current !== "/") return;
      router.navigate({ pathname: "/(tabs)/io/phone-provider", params: { deviceId: assigned.id, name: assigned.name } });
    })();
  }, [connected]);
  return null;
}
