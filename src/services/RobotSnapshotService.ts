import AsyncStorage from '@react-native-async-storage/async-storage';
import { BuiltProgram, Grid, Point, Tool } from '../models/robotModels';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RobotSnapshot = {
  robotSerial: string;
  robotName: string;
  savedAt: number;
  programs: BuiltProgram[];   // isRoutine === false
  routines: BuiltProgram[];   // isRoutine === true
  tools: Tool[];
  grids: Grid[];
  points: Point[];
};

export type SyncStatus =
  | 'phone_newer'   // phone timestamp > robot timestamp
  | 'robot_newer'   // robot timestamp > phone timestamp
  | 'phone_only'    // exists on phone, not robot
  | 'robot_only'    // exists on robot, not phone
  | 'same';         // timestamps match exactly

export type SyncChoice = 'phone' | 'controller';

export type SyncItem<T> = {
  name: string;
  phoneItem: T | null;
  robotItem: T | null;
  status: SyncStatus;
  choice: SyncChoice;
};

export type SyncDiff = {
  programs: SyncItem<BuiltProgram>[];
  routines: SyncItem<BuiltProgram>[];
  tools:    SyncItem<Tool>[];
  grids:    SyncItem<Grid>[];
};

// ── Storage ───────────────────────────────────────────────────────────────────

const key = (serial: string) => `robot_snapshot_v1_${serial}`;

export const RobotSnapshotService = {
  async save(snapshot: RobotSnapshot): Promise<void> {
    await AsyncStorage.setItem(key(snapshot.robotSerial), JSON.stringify(snapshot));
  },

  async load(serial: string): Promise<RobotSnapshot | null> {
    const raw = await AsyncStorage.getItem(key(serial));
    return raw ? (JSON.parse(raw) as RobotSnapshot) : null;
  },

  // ── Diff ───────────────────────────────────────────────────────────────────

  computeDiff(
    snapshot: RobotSnapshot,
    robot: { programs: BuiltProgram[]; tools: Tool[]; grids: Grid[] },
  ): SyncDiff {
    const robotPrograms = robot.programs.filter(p => !p.isRoutine);
    const robotRoutines = robot.programs.filter(p =>  p.isRoutine);

    return {
      programs: diffList(snapshot.programs, robotPrograms, p => p.name, p => p.lastUpdatedUnixMs),
      routines: diffList(snapshot.routines, robotRoutines, p => p.name, p => p.lastUpdatedUnixMs),
      tools:    diffList(snapshot.tools,    robot.tools,   t => t.name, t => t.lastUpdatedUnixMs),
      grids:    diffList(snapshot.grids,    robot.grids,   g => g.name, g => g.lastUpdatedUnixMs),
    };
  },

  hasDifferences(diff: SyncDiff): boolean {
    return (
      [...diff.programs, ...diff.routines, ...diff.tools, ...diff.grids]
        .some(i => i.status !== 'same')
    );
  },
};

function diffList<T>(
  phoneItems: T[],
  robotItems: T[],
  getName: (t: T) => string,
  getTs:   (t: T) => number,
): SyncItem<T>[] {
  const allNames = new Set([...phoneItems.map(getName), ...robotItems.map(getName)]);
  return Array.from(allNames).sort().map(name => {
    const phone = phoneItems.find(i => getName(i) === name) ?? null;
    const robot = robotItems.find(i => getName(i) === name) ?? null;

    let status: SyncStatus;
    let choice: SyncChoice;

    if (!phone)                            { status = 'robot_only';   choice = 'controller'; }
    else if (!robot)                       { status = 'phone_only';   choice = 'phone';       }
    else if (getTs(phone) === getTs(robot)){ status = 'same';         choice = 'controller';  }
    else if (getTs(phone) >  getTs(robot)) { status = 'phone_newer';  choice = 'phone';       }
    else                                   { status = 'robot_newer';  choice = 'controller';  }

    return { name, phoneItem: phone, robotItem: robot, status, choice };
  });
}
