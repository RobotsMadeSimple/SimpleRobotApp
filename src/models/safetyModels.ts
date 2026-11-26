// Emergency stop, alarm history and backup/restore — the controller's GetEstopConfig, GetAlarms,
// GetAlarmCatalog and /backup shapes (SimpleRobotController docs/websocket-api.md "Safety & alarms",
// "Backup & restore").

export type EstopSource = "stb" | "io";
export type EstopPolarity = "normallyClosed" | "normallyOpen";

export type EstopConfig = {
  enabled: boolean;
  source: EstopSource;
  /** STB4100 input 1..4 (source "stb"). */
  stbInput: number;
  /** Edge device stable id (source "io"). */
  deviceId: string | null;
  pin: number | null;
  polarity: EstopPolarity;
};

export type EstopState = {
  enabled: boolean;
  active: boolean;
  latched: boolean;
  sourceOnline: boolean;
  /** Raw input level; null while the source is offline. */
  input: boolean | null;
  /** Null while monitoring is off or the source is offline. */
  inputHealthy: boolean | null;
  source: string;
  reason: string | null;
  trippedUnixMs: number | null;
};

export const DEFAULT_ESTOP_CONFIG: EstopConfig = {
  enabled: false, source: "stb", stbInput: 4, deviceId: null, pin: null, polarity: "normallyClosed",
};

export type AlarmSeverity = "critical" | "error" | "warning" | "info";

export type AlarmCatalogEntry = {
  code: string;
  title: string;
  severity: AlarmSeverity;
  cause: string;
  remedy: string;
  catchable: boolean | null;
};

export type AlarmSource = {
  programId?: string | null;
  programName?: string | null;
  stepId?: string | null;
  deviceId?: string | null;
  pluginId?: string | null;
  background?: boolean | null;
};

export type AlarmEntry = {
  id: string;
  code: string;
  severity: AlarmSeverity;
  title: string;
  message: string;
  source: AlarmSource;
  timestampUnixMs: number;
  acknowledged: boolean;
  acknowledgedUnixMs: number | null;
  cleared: boolean;
  clearedUnixMs: number | null;
  active: boolean;
};

export type AlarmPage = {
  total: number;
  activeCount: number;
  offset: number;
  lastAlarmUpdate: number;
  alarms: AlarmEntry[];
};

export type BackupPlugin = { id: string; name?: string | null; version?: string | null };

export type BackupManifest = {
  format: string;
  formatVersion: number;
  controllerVersion: string;
  robotType: string;
  robotName: string;
  serialNumber: string;
  createdUnixMs: number;
  createdUtc: string;
  plugins: BackupPlugin[];
  files: string[];
};

export type BackupCategory = { key: string; label: string; current: number; backup: number };

export type RestorePreview = {
  manifest: BackupManifest;
  categories: BackupCategory[];
  missingPlugins: BackupPlugin[];
  warnings: string[];
  fileCount: number;
  totalBytes: number;
};

export type RestoreResult = {
  ok: boolean;
  applied: boolean;
  preview: RestorePreview;
  filesWritten?: number;
  preRestoreBackup?: string;
  restarting?: boolean;
};
