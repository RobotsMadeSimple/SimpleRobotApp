import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { BuiltProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";

// Simple Robot Script files (.srs — controller docs/program-language.md §6.12).
// Export = FormatProgramText + an `@program {…}` header line (name and kind), shared as a file:
// a browser download on web/Electron, the share sheet on Android/iOS. Import = pick a file, read
// its text; the caller parses it (ParseProgramText with no base) and saves it under a name.

export type SrsProgramMeta = { name?: string; description?: string; isRoutine?: boolean; isBackground?: boolean };

function safeName(name: string): string {
  return (name || "program").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "program";
}

/** The program as a complete .srs file: pragma, `@program` header, then the formatted text. */
export async function programToSrsFile(program: BuiltProgram): Promise<string> {
  const { text } = await robotClient.formatProgramText(program, { includeHeader: true });
  // The controller writes the header (with every program setting); an older one may not.
  if (readSrsProgramMeta(text)) return text;
  const meta: SrsProgramMeta = {
    name: program.name,
    ...(program.description ? { description: program.description } : {}),
    isRoutine: !!program.isRoutine,
    isBackground: !!program.isBackground,
  };
  const header = `@program ${JSON.stringify(meta)}`;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // Keep the pragma first (the formatter emits it); the header goes right after it.
  if (lines[0]?.startsWith("#!srs")) return [lines[0], header, ...lines.slice(1)].join("\n");
  return ["#!srs 1", header, ...lines].join("\n");
}

/** Read the `@program {…}` header of a .srs file (null when absent or not JSON). */
export function readSrsProgramMeta(text: string): SrsProgramMeta | null {
  const m = /^[ \t]*@program[ \t]+(\{.*\})[ \t]*(#.*)?$/m.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]) as SrsProgramMeta; } catch { return null; }
}

/** Save/share a .srs file. */
export async function shareSrsFile(programName: string, content: string): Promise<void> {
  const filename = `${safeName(programName)}.srs`;
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
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
  await FileSystem.writeAsStringAsync(uri, content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/plain", dialogTitle: filename, UTI: "public.plain-text" });
  }
}

/** Let the user pick a .srs (or any text) file. Null when cancelled. */
export async function pickSrsFile(): Promise<{ fileName: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === "web" ? [".srs", "text/plain", "*/*"] : ["text/plain", "application/octet-stream", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  let text: string;
  if (Platform.OS === "web") {
    const file = (asset as unknown as { file?: File }).file;
    text = file ? await file.text() : await (await fetch(asset.uri)).text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" });
  }
  return { fileName: asset.name, text };
}
