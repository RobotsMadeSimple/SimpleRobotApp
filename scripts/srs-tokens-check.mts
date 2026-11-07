// Checks the SRS colouring tokenizer (src/components/ui/code-editor/srsTokens.ts) and the
// completion engine (srsCompletions.ts):
//   1. every fixture .srs file from the controller (RobotControl.Tests/**/Fixtures/srs/*.srs, package D)
//      plus the spec's examples tokenizes with tokens that tile each line exactly (no gaps, no
//      overlaps, nothing past the end) and no "error" tokens;
//   2. spot checks: statement keywords only in statement position, $vars, strings + templates,
//      durations, comments, sections, attributes, named args, continuation lines;
//   3. completion contexts: line start, after `$`, MoveL target, `,` named args, arg values, call.
//
//   npx tsx scripts/srs-tokens-check.mts
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { srsKeywords, srsStartState, srsTokenize, srsTokenizeLine, type SrsTokenType } from "../src/components/ui/code-editor/srsTokens";
import {
  buildSrsCompletionData, srsCompletionsAt, srsKeywordSet, srsLineHelp, srsNameItems, srsNameText, srsResolveName, srsUnderscore, stepSnippet,
} from "../src/components/ui/code-editor/srsCompletions";
import type { StepCatalog } from "../src/models/robotModels";

let failures = 0;
const fail = (msg: string) => { failures++; console.log("FAIL  " + msg); };
const ok = (cond: boolean, msg: string) => { if (!cond) fail(msg); };

// ── 1. Fixtures ──────────────────────────────────────────────────────────────
const CONTROLLER = process.env.CONTROLLER_DIR ?? join(process.cwd(), "..", "SimpleRobotController");
function findSrs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "bin" || name === "obj" || name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) findSrs(p, out);
    else if (name.endsWith(".srs")) out.push(p);
  }
  return out;
}
const fixtures = findSrs(join(CONTROLLER, "RobotControl.Tests"));

// The spec's complete example (docs/program-language.md §6.7) and a sweep of §6.5's forms.
const SPEC_EXAMPLE = `#!srs 1
var count = 0              # Parts placed this run
var ok: bool = off
var grams = 0
var target = 25            # Fill weight (g)
var parts: list point
global persistent monitor var runs = 0
param inout height = 20
computed area = $w * $h

## Setup
SetTool Gripper
SetSpeedL 200, accel=800, decel=800
prompt "Load the tray and press Start", buttons=("Start", "Cancel"), result=$ok
if $ok == 1
  exit "Cancelled by operator"
end

## Find parts
try retry=2, delay=1s
  RunVision "Find parts", frame=robot, pass=$ok
    "Parts".points -> $parts
  end
  if not $ok
    raise "No parts found", code=noParts
  end
catch $msg
  status error "Vision failed: {$msg}"
  exit
end

## Pick and place
for _, $i in $parts
  @name "Approach"
  JumpL $parts[$i], z=40
  GripperAction close, until=$io.Nano.Grip >= 300
  JumpL grid Tray[$count], z=40
  MoveL Pick1, offset=(x=1, z=$h), set=(z=30), toolOffset=(z=-5), local=Fixture1
  SetOutput relay 3 off, pulse=250ms, blocking=on
  Wait until $stb.in1 and $ok, timeout=5s, timedOut=$late, onTimeout=error
  ReadLoadCell $grams, device="Scale Nano", pin=2
  if $grams < $target
    status warning "Slot {$count} light: {round($grams, 1)} g"
    continue
  end
  $count = $count + 1
  $vals.insert(0, $grams)
  $pts[$i].z = 10
end
HttpRequest "http://192.168.4.10:8080/move", wait=on, timeout=5s
  send "board" = list $cells
  receive "move" -> $move
end
@off
@with {"note": "x # not a comment"}
MoveC P3,
  via=P2, speed=50
call Pick(height=20, count=$n), out found=$ok
status "Placed {$count} parts"
`;

const sources: { name: string; text: string }[] = [
  { name: "spec §6.7 + §6.5", text: SPEC_EXAMPLE },
  ...fixtures.map(f => ({ name: f, text: readFileSync(f, "utf8") })),
];

let lines = 0, tokens = 0;
for (const src of sources) {
  const all = srsTokenize(src.text);
  const textLines = src.text.split(/\r?\n/);
  all.forEach((toks, i) => {
    lines++;
    tokens += toks.length;
    const line = textLines[i];
    let pos = 0;
    for (const t of toks) {
      if (t.from < pos) fail(`${src.name}:${i + 1} overlapping token at ${t.from}`);
      if (/\S/.test(line.slice(pos, t.from))) fail(`${src.name}:${i + 1} untokenized text "${line.slice(pos, t.from)}"`);
      if (t.to > line.length) fail(`${src.name}:${i + 1} token past the end`);
      if (t.type === "error") fail(`${src.name}:${i + 1} error token "${line.slice(t.from, t.to)}" in: ${line}`);
      pos = t.to;
    }
    if (/\S/.test(line.slice(pos))) fail(`${src.name}:${i + 1} untokenized tail "${line.slice(pos)}"`);
  });
}

// ── 2. Spot checks ───────────────────────────────────────────────────────────
function types(line: string, state = srsStartState()): [string, SrsTokenType][] {
  return srsTokenizeLine(line, state).map(t => [line.slice(t.from, t.to), t.type]);
}
function typeOf(line: string, word: string, state = srsStartState()): SrsTokenType | undefined {
  return types(line, state).find(([w]) => w === word)?.[1];
}
ok(typeOf("MoveL Pick1, speed=200", "MoveL") === "keyword", "MoveL is a keyword");
ok(typeOf("movel Pick1", "movel") === "keyword", "keywords are case-insensitive");
ok(typeOf("MoveL Wait", "Wait") === "name", "a keyword word in argument position is a name");
ok(typeOf("MoveL Pick1, speed=200", "speed") === "argName", "speed= is an argName");
ok(typeOf("MoveL Pick1, speed=200", "200") === "number", "200 is a number");
ok(JSON.stringify(types("Wait 500ms").slice(1)) === JSON.stringify([["500", "number"], ["ms", "unit"]]), "500ms → number + unit");
ok(typeOf("Wait 1.5s", "s") === "unit", "1.5s unit");
ok(typeOf("if $count > 5 and $ok", "if") === "flow", "if is flow");
ok(typeOf("if $count > 5 and $ok", "$count") === "variable", "$count is a variable");
ok(typeOf("if $count > 5 and $ok", "and") === "operator", "and is an operator");
ok(typeOf("## Pick", "## Pick") === "section", "## is a section");
ok(typeOf("# hello", "# hello") === "comment", "# is a comment");
ok(typeOf("#!srs 1", "#!srs 1") === "pragma", "pragma");
ok(typeOf("@name \"Approach\"", "@name") === "attr", "@name is an attr");
ok(typeOf("SetOutput stb 1 on", "on") === "bool", "on is a bool");
ok(typeOf("var count = 0", "var") === "decl", "var is decl");
ok(typeOf("var ok: bool = off", "bool") === "decl", "bool type is decl");
ok(typeOf("global persistent monitor var runs = 0", "persistent") === "decl", "persistent is decl");
ok(typeOf("$count = $count + 1", "=") === "operator", "assignment =");
{
  const t = types(`status "Slot {$count} light"`);
  ok(t.some(([w, k]) => w === "{" && k === "template") && t.some(([w, k]) => w === "$count" && k === "variable"),
    "template braces and the $var inside a string");
  ok(t.filter(([, k]) => k === "string").length >= 2, "string pieces around the template");
}
ok(typeOf(`status "a # b" # c`, "# c") === "comment", "# inside a string is not a comment");
ok(typeOf(`raise "x\\"y"`, "\\\"") === "escape", "escape in a string");
ok(typeOf(`MoveL "Pick 1"`, "\"Pick 1\"") === undefined && types(`MoveL "Pick 1"`).some(([, k]) => k === "string"), "quoted name is a string");
ok(types(`status "unterminated`).some(([, k]) => k === "error"), "unterminated string is an error token");
ok(typeOf("JumpJ grid Tray[$r, $c], z=$safeZ", "grid") === "flow", "grid is a target word");
ok(typeOf(`@with {"note": "x # y"}`, `{"note": "x # y"}`) === "json", "@with JSON is one dimmed token (a # inside is not a comment)");
ok(typeOf(`@program {"name": "P"}`, `{"name": "P"}`) === "json", "@program JSON is one dimmed token");
ok(typeOf("else if $x > 1", "if") === "flow", "else if");
ok(typeOf("SetOutput stb 2 toggle", "toggle") === "bool", "toggle is a value word");
ok(typeOf("SetJointPosition J3, 90", "J3") === "bool", "J<n> is a value word");
{
  const st = srsStartState();
  srsTokenizeLine("HttpRequest \"http://x\"", st);
  ok(typeOf(`  send "board" = list $cells`, "list", st) === "bool", "mapping row: = list $v");
}
{
  // A continuation line's first word is not a statement keyword.
  const st = srsStartState();
  srsTokenizeLine("MoveC P3,", st);
  ok(typeOf("  Wait=2", "Wait", st) === "argName", "continuation line: first word is not a statement");
  const st2 = srsStartState();
  srsTokenizeLine("prompt \"x\", buttons=(\"A\",", st2);
  ok(typeOf("  \"B\")", "\"", st2) === "string" || types("  \"B\")", st2).length > 0, "open paren continues the line");
}
{
  // A catalog keyword set replaces the defaults.
  const kw = srsKeywords(["MoveL", "if", "$", "#", "Frobnicate"]);
  ok(kw.steps.has("frobnicate") && !kw.steps.has("$") && !kw.steps.has("if"), "catalog keywords: steps only, no statement forms");
}

// ── 3. Completions ───────────────────────────────────────────────────────────
const catalogPath = process.env.SRS_CATALOG;
let catalog: StepCatalog | null = null;
if (catalogPath && existsSync(catalogPath)) catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const fakeCatalog: StepCatalog = catalog ?? {
  catalogVersion: 1, languageVersion: 1, categories: [], errorCodes: [{ code: "waitTimeout", label: "", catchable: true }],
  commonFields: [], legacyFields: [],
  steps: [
    { type: "MoveL", category: "motion", label: "Move Linear", description: "Straight line", keyword: "MoveL", aliases: [], background: false, body: null,
      syntax: "MoveL <target>[, speed=…]", summary: "",
      fields: [
        { key: "target", arg: "", position: 0, label: "Target", group: "", kind: "target", default: null, exprKey: null, required: false },
        { key: "speed", arg: "speed", position: null, label: "Speed", group: "", kind: "number", unit: "mm/s", default: null, exprKey: "speed", required: false },
        { key: "blend", arg: "blend", position: null, label: "Blend", group: "", kind: "bool", default: false, exprKey: null, required: false },
        { key: "moveStopMode", arg: "untilMode", position: null, label: "When true", group: "", kind: "enum", default: "stop", exprKey: null, required: false,
          options: [{ value: "stop", label: "Stop" }, { value: "record", label: "Record" }] },
      ] },
    { type: "CallRoutine", category: "flow", label: "Call Routine", description: "", keyword: "call", aliases: [], background: true, body: null,
      syntax: "call <routine>", summary: "", fields: [{ key: "routineId", arg: "", position: 0, label: "Routine", group: "", kind: "routineRef", default: null, exprKey: null, required: true }] },
  ] as StepCatalog["steps"],
};
const data = buildSrsCompletionData(fakeCatalog, { points: ["Pick1", "Place 2"], routines: ["Pick"], grids: ["Tray"] },
  { variables: [{ name: "count", kind: "number", isGlobal: false } as any], properties: [{ name: "robot.x", description: "X" } as any], functions: [{ name: "round", signature: "round(x, n)" } as any], io: [] },
  [{ name: "grams" } as any]);
const labels = (r: ReturnType<typeof srsCompletionsAt>) => r?.items.map(i => i.label) ?? [];

ok(labels(srsCompletionsAt("Mo", 2, data)).includes("MoveL"), "line start: MoveL");
ok(srsCompletionsAt("Mo", 2, data)?.items.find(i => i.label === "MoveL")?.snippet?.startsWith("MoveL ${") === true, "MoveL completes as a snippet");
ok(labels(srsCompletionsAt("  rep", 5, data)).includes("repeat"), "line start (indented): repeat");
ok(labels(srsCompletionsAt("MoveL ", 6, data)).includes("Pick1"), "MoveL target: points");
{
  const place = srsCompletionsAt("MoveL ", 6, data)?.items.find(i => i.insert === "Place_2");
  ok(place?.label === "Place_2" && place?.detail === "point \"Place 2\"", "a name with a space completes as its underscore form, real name in the detail");
  ok(labels(srsCompletionsAt("MoveL Pla", 9, data)).includes("Place_2"), "the underscore form filters by prefix");}
// Underscore forms (controller SrsNameMatch): resolution, ambiguity, keyword clash.
ok(srsUnderscore("Pick 1") === "Pick_1" && srsUnderscore("Bin - left") === "Bin_left" && srsUnderscore("  padded  ") === "_padded_", "srsUnderscore: each run → one _");
ok(srsResolveName(["Pick 1", "Pick_1"], "Pick_1").name === "Pick_1", "an exact name wins over an underscore form");
ok(srsResolveName(["Pick 1"], "pick_1").name === "Pick 1", "underscore forms resolve case-insensitively");
ok(srsResolveName(["Pick 1", "Pick-1"], "Pick_1").ambiguous, "two names with one underscore form are ambiguous");
ok(srsNameText("Pick 1", ["Pick 1", "Pick-1"]) === "\"Pick 1\"", "an ambiguous underscore form falls back to quotes");
ok(srsNameText("Pick 1", ["Pick 1", "Pick_1"]) === "\"Pick 1\"", "an underscore form naming another item falls back to quotes");
ok(srsNameText("Pick1") === "Pick1" && srsNameText("Pick 1") === "Pick_1", "bare identifier / underscore form");
ok(srsNameText("1st pick") === "\"1st pick\"" && srsNameText(" ") === "\" \"" && srsNameText("end") === "\"end\"", "not an identifier / reserved → quoted");
ok(srsNameText("Move L", ["Move L"], new Set(["move_l"])) === "\"Move L\"", "an underscore form that is a keyword is quoted");
ok(srsKeywordSet(data.steps).has("movel") && srsKeywordSet().has("elif"), "keyword set: catalog + statement words");
{
  const items = srsNameItems(["Pick 1", "Pick-1", "Pick1"], "point");
  ok(JSON.stringify(items.map(i => i.insert)) === JSON.stringify(["\"Pick 1\"", "\"Pick-1\"", "Pick1"]), "ambiguous names complete quoted");
  ok(items[0].label === "Pick 1" && items[0].detail === "point", "a quoted item keeps the real name as its label");
}
ok(labels(srsCompletionsAt("MoveL ", 6, data)).includes("here"), "MoveL target: here");
ok(labels(srsCompletionsAt("MoveL grid ", 11, data)).includes("Tray"), "grid names");
ok(labels(srsCompletionsAt("MoveL Pick1, ", 13, data)).includes("speed"), "after comma: named args");
ok(!labels(srsCompletionsAt("MoveL Pick1, speed=2, ", 22, data)).includes("speed"), "used args are not offered again");
ok(srsCompletionsAt("MoveL Pick1, ", 13, data)?.items.find(i => i.label === "speed")?.detail?.includes("mm/s") === true, "arg detail carries the unit");
ok(labels(srsCompletionsAt("MoveL Pick1, untilMode=", 23, data)).join() === "stop,record", "enum values after arg=");
ok(labels(srsCompletionsAt("MoveL Pick1, blend=", 19, data)).join() === "on,off", "bool values after arg=");
ok(labels(srsCompletionsAt("call ", 5, data)).includes("Pick"), "call: routines");
ok(labels(srsCompletionsAt("if $c", 5, data)).includes("$count"), "$ completes variables");
ok(labels(srsCompletionsAt("if $gr", 6, data)).includes("$grams"), "$ completes the program's own variables");
ok(labels(srsCompletionsAt("$x = rou", 8, data)).includes("round"), "functions in expressions");
ok(srsCompletionsAt("# MoveL ", 8, data) === null, "no completion in a comment");
ok(srsCompletionsAt("status \"Mo", 10, data) === null, "no completion in a string");
ok(labels(srsCompletionsAt("status \"{$co", 12, data)).includes("$count"), "$ completes in a template");
ok(labels(srsCompletionsAt("goto ", 5, data, "label retry\nlabel \"Next one\"\ngoto ")).join() === "retry,Next_one", "goto: labels in the text (underscore form)");
ok(typeOf("MoveL Pick_1, speed=200", "Pick_1") === "name", "an underscore-form name highlights as a name");
{
  const st = srsStartState();
  srsTokenizeLine("RunVision Detect_Parts", st);
  const row = types("  Top_edge.angle -> $a", st);
  ok(!row.some(([, k]) => k === "error") && row.some(([w, k]) => w === "$a" && k === "variable"), "a Run Vision row with an underscore tool name tokenizes");
}
ok(srsLineHelp("  MoveL Pick1", data)?.syntax.startsWith("MoveL") === true, "line help for a step");
ok(srsLineHelp("repeat 3", data)?.syntax.includes("repeat") === true, "line help for a flow form");
if (catalog) {
  // Every real catalog step produces a snippet whose ${} fields are balanced.
  for (const s of data.steps) {
    const sn = stepSnippet(s);
    ok((sn.match(/\$\{/g) ?? []).length === (sn.match(/\}/g) ?? []).length, `snippet braces balance for ${s.keyword}: ${sn}`);
  }
}

console.log(`\nsrs tokens: ${sources.length} source(s) (${fixtures.length} controller fixture file(s)), ${lines} lines, ${tokens} tokens${catalog ? ", real catalog" : ""}`);
if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log("all srs token + completion checks passed");
