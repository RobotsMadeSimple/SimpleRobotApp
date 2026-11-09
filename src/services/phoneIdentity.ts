import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─────────────────────────────────────────────────────────────────────────────
// Phone identity
//
// Each phone that can act as a provider has a STABLE id of its own, stored locally on the phone
// (identity is inherently per-device, so this is the one piece that legitimately lives in
// AsyncStorage rather than controller-side). A device's *assignment* to a phone is stored on the
// controller (in the device's providerConfig blob) so the setup phone can see who provides it; the
// phone also remembers which device it was assigned to, so it releases that device if reassigned.
// ─────────────────────────────────────────────────────────────────────────────

const ID_KEY   = "provider.phoneId";
const NAME_KEY = "provider.phoneName";
const DEV_KEY  = "provider.assignedDeviceId";

export type PhoneIdentity = { id: string; name: string };

let cached: PhoneIdentity | null = null;

function genId(): string {
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return `ph_${rnd()}${rnd()}${Date.now().toString(36)}`;
}

/** This phone's stable identity, generated and persisted on first use. */
export async function ensurePhoneIdentity(): Promise<PhoneIdentity> {
  if (cached) return cached;
  let id: string | null = null;
  let name: string | null = null;
  try { id = await AsyncStorage.getItem(ID_KEY); } catch { /* storage unavailable */ }
  try { name = await AsyncStorage.getItem(NAME_KEY); } catch { /* storage unavailable */ }
  if (!id) { id = genId(); try { await AsyncStorage.setItem(ID_KEY, id); } catch { /* noop */ } }
  if (!name) {
    name = (Constants.deviceName && Constants.deviceName.trim()) || "Phone";
    try { await AsyncStorage.setItem(NAME_KEY, name); } catch { /* noop */ }
  }
  cached = { id, name };
  return cached;
}

/** Rename this phone (what the setup phone sees as the provider's name). */
export async function setPhoneName(name: string): Promise<void> {
  const trimmed = name.trim() || "Phone";
  if (cached) cached = { ...cached, name: trimmed };
  try { await AsyncStorage.setItem(NAME_KEY, trimmed); } catch { /* noop */ }
}

const DEVNAME_KEY = "provider.assignedDeviceName";

/** The device id this phone is currently assigned to provide for (null if none). */
export async function getAssignedDeviceId(): Promise<string | null> {
  try { return await AsyncStorage.getItem(DEV_KEY); } catch { return null; }
}

/** The assigned device id + display name (for auto-resume + auto-navigate on app launch). */
export async function getAssignedDevice(): Promise<{ id: string; name: string } | null> {
  try {
    const id = await AsyncStorage.getItem(DEV_KEY);
    if (!id) return null;
    const name = (await AsyncStorage.getItem(DEVNAME_KEY)) || "Phone";
    return { id, name };
  } catch { return null; }
}

export async function setAssignedDeviceId(id: string | null, name?: string): Promise<void> {
  try {
    if (id) {
      await AsyncStorage.setItem(DEV_KEY, id);
      if (name) await AsyncStorage.setItem(DEVNAME_KEY, name);
    } else {
      await AsyncStorage.removeItem(DEV_KEY);
      await AsyncStorage.removeItem(DEVNAME_KEY);
    }
  } catch { /* noop */ }
}
