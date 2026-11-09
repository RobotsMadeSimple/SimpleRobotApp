import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { gramsToUnit } from "@/src/components/ui/loadcell";
import type { IoSample, LoadCellUnit } from "@/src/models/robotModels";

// Export a recording's samples. Cross-platform: a browser download on web/Electron, the
// native share sheet (expo-sharing) on Android/iOS. Columns: raw + grams (the master unit)
// + the chosen display unit, so the file is useful regardless of calibration state.

function buildCsv(samples: IoSample[], unit: LoadCellUnit): string {
  const lines = [`unixMs,iso,raw,grams,${unit}`];
  for (const s of samples) {
    const iso = new Date(s.t).toISOString();
    lines.push(`${s.t},${iso},${s.r},${s.v},${gramsToUnit(s.v, unit)}`);
  }
  return lines.join("\n");
}

function safeName(name: string): string {
  return (name || "recording").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export async function exportSamplesCsv(name: string, samples: IoSample[], unit: LoadCellUnit): Promise<void> {
  const csv = buildCsv(samples, unit);
  const filename = `${safeName(name)}.csv`;

  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const uri = (FileSystem.cacheDirectory ?? "") + filename;
  await FileSystem.writeAsStringAsync(uri, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: filename, UTI: "public.comma-separated-values-text" });
  }
}
