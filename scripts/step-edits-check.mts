// Checks the builder's pure step-tree edits (src/components/ui/builder/stepEdits.ts and
// scopeFrames.ts): scope navigation into every body kind, edits by id anywhere in the tree, and the
// drag-bar move rules (within a list, into and out of bodies, refusals).
//   npx tsx scripts/step-edits-check.mts
import type { ProgramStep } from "../src/models/robotModels.ts";
import {
  getStepsAtScope, setStepsAtScope, blockBodyFrames, frameResolves, type ScopeFrame,
} from "../src/components/ui/builder/scopeFrames.ts";
import {
  insertAt, locateStep, mapStepsById, moveRefusal, moveStep, removeStepsById, replaceStepById, sameScope, topSelected,
} from "../src/components/ui/builder/stepEdits.ts";
import { renameVariableInSteps } from "../src/components/ui/builder/renameVariable.ts";

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `  —  ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}
const ids = (list: ProgramStep[]) => list.map(s => s.id).join(",");
const st = (id: string, extra: Partial<ProgramStep> = {}): ProgramStep => ({ id, type: "Wait", ...extra } as ProgramStep);

// A program with every body kind: loop, if/else-if/else, switch cases/default, try/catch.
const program: ProgramStep[] = [
  st("a"),
  { id: "loop", type: "Loop", loopSteps: [st("l1"), st("l2")] } as ProgramStep,
  { id: "if", type: "IfCondition", condition: { combinator: "ALL", items: [] }, ifSteps: [st("i1")],
    elseIfBranches: [{ id: "ei", condition: { combinator: "ALL", items: [] }, steps: [st("e1")] }], elseSteps: [st("x1")] } as ProgramStep,
  { id: "sw", type: "Switch", switchExpr: "$n", switchCases: [{ id: "c1", values: ["1"], steps: [st("s1")] }, { id: "c2", values: ["2", "3"], steps: [] }],
    switchDefault: [st("d1")] } as ProgramStep,
  { id: "try", type: "Try", trySteps: [st("t1", { type: "Wait" })], catchSteps: [] } as ProgramStep,
  st("z"),
];

const F = (stepId: string, kind: ScopeFrame["kind"], branchId?: string): ScopeFrame => ({ stepId, kind, label: kind, branchId });

// ── scope navigation ──────────────────────────────────────────────────────────
check("loop body", ids(getStepsAtScope(program, [F("loop", "loop")])) === "l1,l2");
check("else-if body", ids(getStepsAtScope(program, [F("if", "elseIf", "ei")])) === "e1");
check("switch case body", ids(getStepsAtScope(program, [F("sw", "switchCase", "c1")])) === "s1");
check("switch default body", ids(getStepsAtScope(program, [F("sw", "switchDefault")])) === "d1");
check("try / catch bodies", ids(getStepsAtScope(program, [F("try", "try")])) === "t1" && getStepsAtScope(program, [F("try", "catch")]).length === 0);
const sw2 = setStepsAtScope(program, [F("sw", "switchCase", "c2")], [st("new")]);
check("write a switch case body", ids(getStepsAtScope(sw2, [F("sw", "switchCase", "c2")])) === "new" && ids(getStepsAtScope(sw2, [F("sw", "switchCase", "c1")])) === "s1");
check("a removed case no longer resolves", !frameResolves({ ...program[3], switchCases: [] }, F("sw", "switchCase", "c1")));
check("body frames of a switch", blockBodyFrames(program[3]).map(f => f.label).join("|") === "CASE 1|CASE 2, 3|DEFAULT");
check("body frames of an if", blockBodyFrames(program[2]).map(f => f.kind).join("|") === "ifTrue|elseIf|else");

// ── edits by id ───────────────────────────────────────────────────────────────
const loc = locateStep(program, "e1");
check("locate a step in an else-if", !!loc && loc.index === 0 && loc.scope.length === 1 && loc.scope[0].branchId === "ei");
const replaced = replaceStepById(program, st("d1", { name: "renamed" }));
check("replace a step inside a switch default", getStepsAtScope(replaced, [F("sw", "switchDefault")])[0].name === "renamed");
const removed = removeStepsById(program, new Set(["l2", "s1", "x1", "z"]));
check("remove steps from several bodies", ids(getStepsAtScope(removed, [F("loop", "loop")])) === "l1"
  && getStepsAtScope(removed, [F("sw", "switchCase", "c1")]).length === 0
  && getStepsAtScope(removed, [F("if", "else")]).length === 0
  && ids(removed) === "a,loop,if,sw,try");
const disabled = mapStepsById(program, new Set(["t1"]), s => ({ ...s, enabled: false }));
check("disable a step inside a try", getStepsAtScope(disabled, [F("try", "try")])[0].enabled === false);
check("top-level selection skips steps inside selected blocks", ids(topSelected(program, new Set(["loop", "l1", "z"]))) === "loop,z");
const inserted = insertAt(program, [F("try", "catch")], 0, [st("c")]);
check("insert into an empty catch", ids(getStepsAtScope(inserted, [F("try", "catch")])) === "c");

// ── moves ─────────────────────────────────────────────────────────────────────
check("move down within a list", ids(moveStep(program, [], 0, [], 3)) === "loop,if,a,sw,try,z");
check("move up within a list", ids(moveStep(program, [], 5, [], 0)) === "z,a,loop,if,sw,try");
const intoLoop = moveStep(program, [], 0, [F("loop", "loop")], 1);
check("move a step into a loop body", ids(intoLoop) === "loop,if,sw,try,z" && ids(getStepsAtScope(intoLoop, [F("loop", "loop")])) === "l1,a,l2");
const outOfCase = moveStep(program, [F("sw", "switchCase", "c1")], 0, [], 6);
check("move a step out of a case to the end", ids(outOfCase).endsWith(",z,s1") && getStepsAtScope(outOfCase, [F("sw", "switchCase", "c1")]).length === 0);
const across = moveStep(program, [F("loop", "loop")], 1, [F("try", "catch")], 0);
check("move across bodies (loop → catch)", ids(getStepsAtScope(across, [F("loop", "loop")])) === "l1" && ids(getStepsAtScope(across, [F("try", "catch")])) === "l2");
check("a missing source leaves the program unchanged", moveStep(program, [], 42, [], 0) === program);
check("refuse a block into its own body", moveRefusal(program[1], [F("loop", "loop")]) === "intoItself");
check("refuse Break / Next outside a loop", moveRefusal(st("b", { type: "LoopControl" }), [F("if", "ifTrue")]) === "loopControlOutsideLoop");
check("allow Break / Next inside a loop's if", moveRefusal(st("b", { type: "LoopControl" }), [F("loop", "loop"), F("i", "ifTrue")]) === null);
check("same scope compares branch ids", sameScope([F("sw", "switchCase", "c1")], [F("sw", "switchCase", "c1")]) && !sameScope([F("sw", "switchCase", "c1")], [F("sw", "switchCase", "c2")]));
check("the original program is never mutated", ids(program) === "a,loop,if,sw,try,z" && ids(getStepsAtScope(program, [F("loop", "loop")])) === "l1,l2");

// ── variable rename reaches the new blocks' fields ───────────────────────────
const renamed = renameVariableInSteps([
  { id: "p", type: "Prompt", promptMessage: "Count {$n}", promptResultVariableName: "n", promptInputVariableName: "N" } as ProgramStep,
  { id: "t", type: "Try", trySteps: [{ id: "r", type: "RaiseError", errorMessage: "bad $n" } as ProgramStep], catchSteps: [], errorVariableName: "n" } as ProgramStep,
  { id: "s", type: "Switch", switchExpr: "$n + 1", switchCases: [{ id: "c", values: ["$n", "2"], steps: [] }] } as ProgramStep,
  { id: "c", type: "CallRoutine", routineArgs: { count: "$n * 2" }, routineOutputs: [{ key: "found", variableName: "n" }] } as ProgramStep,
  { id: "l", type: "ListOp", variableName: "pts", listSourceVariable: "n", listFields: { x: "$n" } } as ProgramStep,
], "n", "count");
const [r0, r1, r2, r3, r4] = renamed;
check("rename: prompt message and targets", r0.promptMessage === "Count {$count}" && r0.promptResultVariableName === "count" && r0.promptInputVariableName === "count", r0);
check("rename: try error variable and a raise inside", r1.errorVariableName === "count" && r1.trySteps![0].errorMessage === "bad $count", r1);
check("rename: switch value and case values", r2.switchExpr === "$count + 1" && r2.switchCases![0].values[0] === "$count" && r2.switchCases![0].values[1] === "2", r2);
check("rename: routine arguments and outputs (param names kept)", r3.routineArgs!.count === "$count * 2" && r3.routineOutputs![0].variableName === "count" && r3.routineOutputs![0].key === "found", r3);
check("rename: list source and field expressions", r4.listSourceVariable === "count" && r4.listFields!.x === "$count" && r4.variableName === "pts", r4);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
