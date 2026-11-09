// Claims station NFC tags (NDEF URI records "simplerobotapp://station?…") for MainActivity.
//
// Without an NDEF_DISCOVERED filter Android hands any tag tapped outside an active in-app read to
// its own Tags app ("New tag scanned"). With it, a tap opens the app straight onto the link —
// cold, or as a new intent while it is running — and React Native reports NDEF_DISCOVERED URIs
// through Linking exactly like a VIEW link, so expo-router lands on app/station.tsx.
//
// Expo's `android.intentFilters` always prefixes actions with "android.intent.action.", so the
// NFC action needs this small plugin instead.
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const NDEF_DISCOVERED = "android.nfc.action.NDEF_DISCOVERED";

module.exports = function withNfcStationIntent(config, { scheme = "simplerobotapp", host = "station" } = {}) {
  return withAndroidManifest(config, cfg => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = (activity["intent-filter"] ??= []);
    const exists = filters.some(f => (f.action ?? []).some(a => a.$["android:name"] === NDEF_DISCOVERED));
    if (!exists) {
      filters.push({
        action: [{ $: { "android:name": NDEF_DISCOVERED } }],
        category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
        data: [{ $: { "android:scheme": scheme, "android:host": host } }],
      });
    }
    return cfg;
  });
};
