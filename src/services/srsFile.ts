import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { BuiltProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";

// Simple Robot Script files (.srs — controller docs/program-language.md §6.12).
// Export = FormatProgramText + an `@program {…}` header line (name and kind), shared as a file:
// a browser download on web/Electron, a remembered folder on Android, the share sheet on iOS. Import = pick a file, read
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

const DOWNLOAD_DIR_KEY = "rms.srsDownloadDir";

/** Readable name of an Android folder URI ("content://…/tree/primary%3ADownload" → "Download"). */
function folderLabel(treeUri: string): string {
  const id = decodeURIComponent(treeUri.split("/tree/")[1] ?? "");
  return id.replace(/^primary:/, "").replace(/^[^:]+:/, "") || "the chosen folder";
}

/** Forget the remembered download folder, so the next download asks again. */
export async function forgetSrsDownloadFolder(): Promise<void> {
  await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY).catch(() => {});
}

/**
 * Download a .srs file. Web/Electron: a browser download. Android: saved straight into a folder
 * the user picked once (Downloads is offered first) and that is remembered — no share sheet.
 * iOS has no shared Downloads folder, so it uses the share sheet ("Save to Files").
 * Returns where it went (Android), or null when it was handled elsewhere or cancelled.
 */
export async function downloadSrsFile(programName: string, content: string): Promise<{ fileName: string; folder: string } | null> {
  const filename = `${safeName(programName)}.srs`;
  if (Platform.OS === "android") {
    const SAF = FileSystem.StorageAccessFramework;
    const write = async (dir: string) => {
      // octet-stream keeps the ".srs" name as given (text/plain would add ".txt").
      const uri = await SAF.createFileAsync(dir, filename, "application/octet-stream");
      await FileSystem.writeAsStringAsync(uri, content, { encoding: "utf8" });
    };
    const saved = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY).catch(() => null);
    if (saved) {
      try { await write(saved); return { fileName: filename, folder: folderLabel(saved) }; }
      catch { await forgetSrsDownloadFolder(); } // permission revoked or folder gone: ask again
    }
    const perm = await SAF.requestDirectoryPermissionsAsync(SAF.getUriForDirectoryInRoot("Download"));
    if (!perm.granted) return null;
    await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, perm.directoryUri).catch(() => {});
    await write(perm.directoryUri);
    return { fileName: filename, folder: folderLabel(perm.directoryUri) };
  }
  await shareSrsFile(programName, content);
  return null;
}

/** Save/share a .srs file (browser download on web, share sheet on native). */
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
