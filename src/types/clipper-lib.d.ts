// Minimal typings for clipper-lib (Clipper polygon offsetting, JS port).
declare module "clipper-lib" {
  export interface IntPoint { X: number; Y: number }
  export type Path = IntPoint[];
  export type Paths = Path[];

  export enum JoinType { jtSquare = 0, jtRound = 1, jtMiter = 2 }
  export enum EndType {
    etOpenSquare = 0, etOpenRound = 1, etOpenButt = 2, etClosedLine = 3, etClosedPolygon = 4,
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: JoinType, endType: EndType): void;
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Execute(solution: Paths, delta: number): void;
    Clear(): void;
  }

  export class Clipper {
    static Orientation(path: Path): boolean;
    static CleanPolygon(path: Path, distance?: number): Path;
  }

  const ClipperLib: {
    IntPoint: new (x: number, y: number) => IntPoint;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
    ClipperOffset: typeof ClipperOffset;
    Clipper: typeof Clipper;
  };
  export default ClipperLib;
}
