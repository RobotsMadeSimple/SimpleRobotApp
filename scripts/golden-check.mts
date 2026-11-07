// Cross-repo golden check: the app's mirrors in src/models/programStepGolden.check.ts against the
// controller's RobotControl.Tests/Golden/*.golden.json, key by key in both directions, and the
// StepType list exactly. tsc already proves the mirrors fit the app types; this proves they
// still match the controller's files.
//   npx tsx scripts/golden-check.mts [path/to/SimpleRobotController]
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { goldenProgramStep, goldenBuiltProgram, STEP_TYPES_ALL } from "../src/models/programStepGolden.check.ts";
import { childLists, walkSteps, STEP_LIST_ROLES } from "../src/models/stepTree.ts";
import type { ProgramStep } from "../src/models/robotModels.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ctrl = resolve(process.argv[2] ?? resolve(here, "../../SimpleRobotController"));
const goldenDir = resolve(ctrl, "RobotControl.Tests/Golden");
if (!existsSync(goldenDir)) {
  console.error(`No controller goldens at ${goldenDir} — pass the SimpleRobotController path.`);
  process.exit(2);
}
const read = (name: string) => JSON.parse(readFileSync(resolve(goldenDir, name), "utf8"));

let fails = 0;
const ok = (cond: boolean, what: string, detail = "") => {
  console.log((cond ? "PASS " : "FAIL ") + what + (cond || !detail ? "" : `\n     ${detail}`));
  if (!cond) fails++;
};

function sameKeys(label: string, controller: Record<string, unknown>, app: Record<string, unknown>) {
  const c = new Set(Object.keys(controller)), a = new Set(Object.keys(app));
  const onlyController = [...c].filter(k => !a.has(k));
  const onlyApp = [...a].filter(k => !c.has(k));
  ok(onlyController.length === 0, `${label}: every controller key is in the app mirror`, onlyController.join(", "));
  ok(onlyApp.length === 0, `${label}: every app key is in the controller golden`, onlyApp.join(", "));
}

const step = read("programstep.golden.json");
sameKeys("programstep", step, goldenProgramStep);
// Nested objects that carry new contracts: compare their keys too.
for (const key of ["switchCases", "routineOutputs", "jsonOutbound", "elseIfBranches"] as const) {
  const c = (step[key] ?? [])[0] ?? {}, a = ((goldenProgramStep as Record<string, unknown>)[key] as Record<string, unknown>[] ?? [])[0] ?? {};
  sameKeys(`programstep.${key}[0]`, c, a);
}

const types = read("steptypes.golden.json") as string[];
ok(JSON.stringify(types) === JSON.stringify(STEP_TYPES_ALL), "STEP_TYPES_ALL equals steptypes.golden.json (names and order)",
   `controller: ${types.join(",")}\n     app:        ${STEP_TYPES_ALL.join(",")}`);

// stepTree (the app's StepTree.cs mirror) sees every body of the golden step, in the frozen role order.
const golden = goldenProgramStep as ProgramStep;
const roles = [...new Set(childLists(golden).map(c => c.role))];
ok(JSON.stringify(roles) === JSON.stringify(STEP_LIST_ROLES), "stepTree visits every body kind in role order", roles.join(","));
const paths = new Map([...walkSteps([golden])].map(x => [x.step.id, x.path]));
ok(paths.get("nested-case-1") === "steps[0].switchCases[0].steps[0]" && paths.get("nested-catch-1") === "steps[0].catchSteps[0]",
   "stepTree builds the controller's stepPaths", JSON.stringify([...paths]));

const program = read("builtprogram.golden.json");
sameKeys("builtprogram", program, goldenBuiltProgram);
sameKeys("builtprogram.variables[0]", program.variables[0], goldenBuiltProgram.variables[0]);

console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
