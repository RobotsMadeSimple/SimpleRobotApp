import { useLocalSearchParams } from "expo-router";

import { PhoneProvider } from "@/src/components/provider/PhoneProvider";

export default function PhoneProviderRoute() {
  // `autostart` is set when the screen is opened from a scanned/tapped provider tag.
  const { deviceId, name, autostart } = useLocalSearchParams<{
    deviceId?: string; name?: string; autostart?: string;
  }>();
  return <PhoneProvider deviceId={deviceId} deviceName={name} autostart={autostart === "1"} />;
}
