// Autocomplete for the SRS text editor (controller docs/program-language.md §7.2).
//
// Pure TS (types only from the app) so it runs inside the native WebView bundle as well as on
// web: the app pushes one `SrsCompletionData` snapshot (built from the step catalog, the robot's
// points/tools/routines/… and the expression symbols) to the editor, and the editor answers
// completions locally on every keystroke without a round trip.
//
//   line start       → step keywords and flow forms, as snippets with placeholders
//   after `$`        → variables, properties and IO (the expression completer, completions.ts)
//   bare word in an expression → functions
//   MoveL / via=     → point names (+ here, grid, stack)
//   call / goto / SetTool / SetLocal / RunVision / StartBackground / device= / camera= → those names
//                    (a name with spaces completes as its underscore form, `Pick_1`, the real
//                    name in the detail — or quoted when that form is ambiguous or a keyword)
//   after `,`        → the step's remaining named args, unit in the detail
//   after `arg=`     → the arg's enum options, or on/off

import type { ExpressionSymbols, ProgramVariable, StepCatalog } from "@/src/models/robotModels";
import { completionsAt } from "@/src/components/ui/builder/expressions/completions";
import { stripComment } from "./srsTokens";

export type SrsArgSpec = {
  arg: string;
  label: string;
  kind: string;
  unit?: string;
  options?: string[];
  help?: string;
  required: boolean;
};

export type SrsStepSpec = {
  type: string;
  keyword: string;
  aliases: string[];
  label: string;
  description: string;
  syntax: string;
  body: string | null;
  /** Positional slots in order (kind per slot) — the first decides the name completer. */
  positional: { label: string; kind: string }[];
  args: SrsArgSpec[];
};

export type SrsNames = {
  points: string[]; tools: string[]; locals: string[]; routines: string[]; grids: string[]; stacks: string[];
  background: string[]; vision: string[]; devices: string[]; cameras: string[]; errorCodes: string[];
};

export type SrsCompletionData = {
  steps: SrsStepSpec[];
  names: SrsNames;
  symbols: ExpressionSymbols | null;
  localVariables: ProgramVariable[];
};

export type SrsCompletionKind = "keyword" | "flow" | "decl" | "arg" | "name" | "value" | "variable" | "property" | "io" | "function";

export type SrsCompletion = {
  label: string;
  kind: SrsCompletionKind;
  /** Plain text that replaces the typed prefix. */
  insert: string;
  /** CodeMirror snippet template (`${name}` placeholders), used instead of `insert` when present. */
  snippet?: string;
  detail?: string;
  info?: string;
};

export const EMPTY_NAMES: SrsNames = {
  points: [], tools: [], locals: [], routines: [], grids: [], stacks: [],
  background: [], vision: [], devices: [], cameras: [], errorCodes: [],
};

/** Flow and declaration forms, as snippets (`\t` = one indent level). */
const FLOW_SNIPPETS: { label: string; snippet: string; detail: string; kind: SrsCompletionKind }[] = [
  { label: "if", snippet: "if ${condition}\n\t${}\nend", detail: "if … end", kind: "flow" },
  { label: "if … else", snippet: "if ${condition}\n\t${}\nelse\n\t\nend", detail: "if … else … end", kind: "flow" },
  { label: "elif", snippet: "elif ${condition}", detail: "another branch", kind: "flow" },
  { label: "else", snippet: "else", detail: "the other branch", kind: "flow" },
  { label: "end", snippet: "end", detail: "close a block", kind: "flow" },
  { label: "repeat", snippet: "repeat ${count} as $${i}\n\t${}\nend", detail: "count loop", kind: "flow" },
  { label: "repeat forever", snippet: "repeat forever\n\t${}\nend", detail: "endless loop", kind: "flow" },
  { label: "while", snippet: "while ${condition}\n\t${}\nend", detail: "loop while true", kind: "flow" },
  { label: "for", snippet: "for $${v}, $${i} in $${list}\n\t${}\nend", detail: "for each list item", kind: "flow" },
  { label: "switch", snippet: "switch ${expr}\ncase ${value}\n\t${}\ndefault\n\t\nend", detail: "switch … case … end", kind: "flow" },
  { label: "case", snippet: "case ${value}", detail: "switch branch", kind: "flow" },
  { label: "default", snippet: "default", detail: "switch fallback", kind: "flow" },
  { label: "try", snippet: "try\n\t${}\ncatch $${msg}\n\t\nend", detail: "try … catch … end", kind: "flow" },
  { label: "catch", snippet: "catch $${msg}", detail: "error handler", kind: "flow" },
  { label: "break", snippet: "break", detail: "leave the loop", kind: "flow" },
  { label: "continue", snippet: "continue", detail: "next iteration", kind: "flow" },
  { label: "return", snippet: "return", detail: "leave the routine", kind: "flow" },
  { label: "exit", snippet: "exit \"${message}\"", detail: "end the program", kind: "flow" },
  { label: "raise", snippet: "raise \"${message}\", code=${code}", detail: "raise an error", kind: "flow" },
  { label: "label", snippet: "label ${name}", detail: "jump target", kind: "flow" },
  { label: "goto", snippet: "goto ${label}", detail: "jump to a label", kind: "flow" },
  { label: "call", snippet: "call ${routine}", detail: "run a routine", kind: "flow" },
  { label: "pause", snippet: "pause", detail: "pause the program", kind: "flow" },
  { label: "status", snippet: "status \"${message}\"", detail: "show a status line", kind: "flow" },
  { label: "prompt", snippet: "prompt \"${message}\", buttons=(\"OK\"), result=$${choice}", detail: "ask the operator", kind: "flow" },
  { label: "stopwatch", snippet: "stopwatch ${start} $${timer}", detail: "start | stop | reset", kind: "flow" },
  { label: "plugin", snippet: "plugin ${id.step}\nend", detail: "run a plugin step", kind: "flow" },
  { label: "var", snippet: "var ${name} = ${value}", detail: "declare a variable", kind: "decl" },
  { label: "computed", snippet: "computed ${name} = ${expr}", detail: "a named formula", kind: "decl" },
  { label: "param", snippet: "param in ${name} = ${value}", detail: "routine parameter", kind: "decl" },
];

const DECL_WORDS = ["global", "persistent", "input", "monitor"];

/** Snippet template for a catalog step: keyword + positional placeholders + required args. */
export function stepSnippet(s: SrsStepSpec): string {
  const parts: string[] = [];
  s.positional.forEach(p => parts.push("${" + placeholder(p.label) + "}"));
  let text = s.keyword + (parts.length ? " " + parts.join(" ") : "");
  const req = s.args.filter(a => a.required);
  req.forEach((a, i) => { text += (i === 0 && parts.length === 0 ? " " : ", ") + a.arg + "=${" + placeholder(a.label) + "}"; });
  if (s.body === "mapping") text += "\n\t${}\nend";
  return text;
}

function placeholder(label: string) {
  return label.replace(/[{}$\\]/g, "").trim() || "value";
}

/** One snapshot of what the editor can complete, from the catalog + robot names + symbols. */
export function buildSrsCompletionData(
  catalog: StepCatalog | null,
  names: Partial<SrsNames>,
  symbols: ExpressionSymbols | null,
  localVariables: ProgramVariable[],
): SrsCompletionData {
  const steps: SrsStepSpec[] = (catalog?.steps ?? [])
    .filter(s => /^[A-Za-z_]\w*$/.test(s.keyword))
    .map(s => {
      const visible = s.fields.filter(f => !f.hidden);
      const positional = visible
        .filter(f => f.position !== null && f.position !== undefined && !f.arg)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(f => ({ label: f.label, kind: String(f.kind) }));
      const args = visible.filter(f => !!f.arg).map<SrsArgSpec>(f => ({
        arg: f.arg, label: f.label, kind: String(f.kind), unit: f.unit, help: f.help, required: f.required,
        options: f.options?.map(o => (typeof o === "string" ? o : String((o as any).value))),
      }));
      return {
        type: s.type, keyword: s.keyword, aliases: s.aliases ?? [], label: s.label, description: s.description,
        syntax: s.syntax, body: s.body ?? null, positional, args,
      };
    });
  return {
    steps,
    names: { ...EMPTY_NAMES, ...names, errorCodes: names.errorCodes ?? catalog?.errorCodes.map(e => e.code) ?? [] },
    symbols,
    localVariables,
  };
}

/** The catalog entry whose keyword or alias is `word` (case-insensitive). */
export function findStepByKeyword(data: SrsCompletionData | null, word: string): SrsStepSpec | undefined {
  if (!data || !word) return undefined;
  const w = word.toLowerCase();
  return data.steps.find(s => s.keyword.toLowerCase() === w || s.aliases.some(a => a.toLowerCase() === w));
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Value words the controller never prints bare as a name (SrsText.Reserved). */
const RESERVED = new Set([
  "on", "off", "true", "false", "here", "grid", "stack", "point", "and", "or", "not", "forever",
  "as", "in", "out", "to", "toggle", "list", "image", "send", "receive", "end", "_",
]);

/** Statement, clause and declaration words (SrsParser.IsKeyword, minus the catalog's own). */
const STATEMENT_WORDS = [
  "if", "while", "repeat", "for", "switch", "try", "break", "continue", "return", "exit", "raise", "label", "goto",
  "call", "pause", "status", "stopwatch", "prompt", "plugin", "unknown", "end", "elif", "else", "case", "default",
  "catch", "var", "computed", "param", "global", "persistent", "input", "monitor", "SetVariable", "ListOp", "Note",
];

/** Every word an underscore-form name must not be (lower-case): reserved + statement words + the catalog's keywords. */
export function srsKeywordSet(steps: SrsStepSpec[] = []): Set<string> {
  const out = new Set<string>(RESERVED);
  for (const w of STATEMENT_WORDS) out.add(w.toLowerCase());
  for (const s of steps) {
    out.add(s.type.toLowerCase());
    out.add(s.keyword.toLowerCase());
    for (const a of s.aliases) out.add(a.toLowerCase());
  }
  return out;
}

/**
 * A name's underscore form (controller SrsNameMatch.Underscore): each run of characters an
 * identifier cannot hold becomes one `_` — "Pick 1" → `Pick_1`, "Bin - left" → `Bin_left`.
 */
export function srsUnderscore(name: string): string {
  return name.replace(/[^A-Za-z0-9_]+/g, "_");
}

/**
 * What `text` resolves to among `names`, as the controller resolves a name written in the text:
 * an exact name, then case-insensitive, then the underscore form (case-sensitive first). An
 * underscore form that fits several names is ambiguous (null + ambiguous).
 */
export function srsResolveName(names: string[], text: string): { name: string | null; ambiguous: boolean } {
  if (!text) return { name: null, ambiguous: false };
  const exact = names.find(n => n === text);
  if (exact !== undefined) return { name: exact, ambiguous: false };
  const lower = text.toLowerCase();
  const ci = names.find(n => n.toLowerCase() === lower);
  if (ci !== undefined) return { name: ci, ambiguous: false };
  const u = srsUnderscore(text);
  for (const fold of [false, true]) {
    const want = fold ? u.toLowerCase() : u;
    const hits = [...new Set(names.filter(n => n && (fold ? srsUnderscore(n).toLowerCase() : srsUnderscore(n)) === want))];
    if (hits.length === 1) return { name: hits[0], ambiguous: false };
    if (hits.length > 1) return { name: null, ambiguous: true };
  }
  return { name: null, ambiguous: false };
}

/**
 * How the text writes `name` (one of `names`), as the controller's printer does: bare when it
 * is an identifier (and not a reserved word), else its underscore form when that is an
 * identifier, is no keyword and resolves back to this same name, else quoted.
 */
export function srsNameText(name: string, names: string[] = [name], keywords: Set<string> = srsKeywordSet()): string {
  if (IDENT.test(name) && !RESERVED.has(name.toLowerCase())) return name;
  const u = srsUnderscore(name);
  if (u !== name && IDENT.test(u) && !keywords.has(u.toLowerCase()) && srsResolveName(names, u).name === name) return u;
  return JSON.stringify(name);
}

/** A name as SRS writes it on its own (no other names to clash with): bare, underscore form or quoted. */
export function srsName(name: string): string {
  return srsNameText(name);
}

/**
 * Completion items for a list of names: the label and insert are how the text writes each
 * name; when that is the underscore form, the detail shows the real name (`point "Pick 1"`).
 */
export function srsNameItems(list: string[], detail: string, keywords: Set<string> = srsKeywordSet()): SrsCompletion[] {
  return list.map(n => {
    const text = srsNameText(n, list, keywords);
    const underscored = text !== n && !text.startsWith("\"");
    return {
      label: underscored ? text : n,
      kind: "name" as const,
      insert: text,
      detail: underscored ? `${detail} ${JSON.stringify(n)}` : detail,
    };
  });
}

const NAME_KIND_LIST: Record<string, keyof SrsNames> = {
  target: "points", pointRef: "points", toolRef: "tools", localRef: "locals", routineRef: "routines",
  visionRef: "vision", programRef: "background", deviceRef: "devices", cameraRef: "cameras",
};

const MAX = 40;

/** Is `col` inside a string or a comment on this line? (templates count as code) */
function inStringOrComment(line: string, col: number): "string" | "comment" | "template" | null {
  let inStr = false, tpl = 0;
  for (let i = 0; i < col; i++) {
    const c = line[i];
    if (inStr) {
      if (tpl > 0) { if (c === "{") tpl++; else if (c === "}") tpl--; else if (c === "\"") { inStr = false; tpl = 0; } }
      else if (c === "\\") i++;
      else if (c === "{") tpl = 1;
      else if (c === "\"") inStr = false;
    } else if (c === "\"") inStr = true;
    else if (c === "#") return "comment";
  }
  return inStr ? (tpl > 0 ? "template" : "string") : null;
}

/** Labels declared in the text (`label NAME`), for `goto`. */
function labelsIn(fullText: string): string[] {
  const out = new Set<string>();
  for (const m of fullText.matchAll(/^\s*label\s+("(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)/gim)) {
    out.add(m[1].startsWith("\"") ? JSON.parse(m[1]) : m[1]);
  }
  return [...out];
}

function filterPrefix<T extends { label: string }>(items: T[], prefix: string): T[] {
  const p = prefix.toLowerCase();
  const starts = items.filter(i => i.label.toLowerCase().startsWith(p));
  const contains = p ? items.filter(i => !i.label.toLowerCase().startsWith(p) && i.label.toLowerCase().includes(p)) : [];
  return [...starts, ...contains].slice(0, MAX);
}

let keywordCache: { steps: SrsStepSpec[] | null; set: Set<string> } = { steps: null, set: srsKeywordSet() };

/** The keyword set for a completion snapshot (rebuilt only when the catalog changes). */
function keywordsOf(data: SrsCompletionData | null): Set<string> {
  const steps = data?.steps ?? null;
  if (keywordCache.steps !== steps) keywordCache = { steps, set: srsKeywordSet(steps ?? []) };
  return keywordCache.set;
}

/**
 * Completions at `col` (0-based) in `line`. `fullText` (optional) is the whole document, used
 * for labels. Returns the replaced range [from, to) in line columns and the items.
 */
export function srsCompletionsAt(
  line: string,
  col: number,
  data: SrsCompletionData | null,
  fullText = "",
  opts: { explicit?: boolean } = {},
): { from: number; to: number; items: SrsCompletion[] } | null {
  const ctx = inStringOrComment(line, col);
  if (ctx === "comment" || ctx === "string") return null;
  const before = line.slice(0, col);
  // The word being typed and where it starts (quotes allowed for names with spaces).
  const wordMatch = /("?[\w.]*)$/.exec(before)!;
  let from = col - wordMatch[1].length;
  const prefix = wordMatch[1].replace(/^"/, "");
  let to = col;
  while (to < line.length && /[\w]/.test(line[to])) to++;

  // ── $variables, properties, IO; functions inside expressions ──
  if (/\$[\w.]*$/.test(before) || ctx === "template") {
    const r = completionsAt(before, before.length, data?.symbols ?? null, data?.localVariables ?? []);
    if (r) {
      return {
        from: r.start, to,
        items: r.items.map(i => ({ label: i.label, kind: i.kind === "variable" ? "variable" : i.kind === "io" ? "io" : i.kind === "function" ? "function" : "property", insert: i.insert, detail: i.detail })),
      };
    }
    if (/\$[\w.]*$/.test(before)) return null;
  }

  const head = before.slice(0, from);
  const trimmedHead = head.trim();

  // ── Statement position: keywords and flow forms ──
  if (trimmedHead === "") {
    if (!prefix && !opts.explicit) return null;
    const items: SrsCompletion[] = [];
    // Flow forms (if, repeat, call …) are lower-case catalog keywords with their own snippets below.
    for (const s of data?.steps ?? []) {
      if (!/^[A-Z]/.test(s.keyword)) continue;
      items.push({ label: s.keyword, kind: "keyword", insert: s.keyword, snippet: stepSnippet(s), detail: s.label, info: s.syntax + (s.description ? "\n" + s.description : "") });
    }
    for (const f of FLOW_SNIPPETS) items.push({ label: f.label, kind: f.kind, insert: f.label, snippet: f.snippet, detail: f.detail });
    for (const d of DECL_WORDS) items.push({ label: d, kind: "decl", insert: d + " ", detail: "modifier" });
    for (const a of ["@name", "@off", "@with"]) items.push({ label: a, kind: "decl", insert: a === "@name" ? "@name \"\"" : a, detail: "attribute" });
    return { from, to, items: filterPrefix(items, prefix) };
  }

  const code = stripComment(before);
  const stmt = /^\s*([A-Za-z_]\w*)/.exec(code)?.[1] ?? "";
  const lstmt = stmt.toLowerCase();
  const step = findStepByKeyword(data, stmt);
  const names = data?.names ?? EMPTY_NAMES;
  const kw = keywordsOf(data);

  // ── After `arg=` : the arg's values ──
  const argEq = /(?:^|[\s,(])([A-Za-z_]\w*)\s*=\s*$/.exec(head);
  if (argEq && !/[=!<>]=\s*$/.test(head)) {
    const argName = argEq[1];
    if (argName === "via" || argName === "local" || argName === "device" || argName === "camera") {
      const list = argName === "via" ? names.points : argName === "local" ? names.locals : argName === "device" ? names.devices : names.cameras;
      return { from, to, items: filterPrefix(srsNameItems(list, argName, kw), prefix) };
    }
    const a = step?.args.find(x => x.arg === argName);
    if (a?.options?.length) {
      return { from, to, items: filterPrefix(a.options.map(o => ({ label: o, kind: "value" as const, insert: o, detail: a.label })), prefix) };
    }
    if (a?.kind === "bool") {
      return { from, to, items: filterPrefix(["on", "off"].map(o => ({ label: o, kind: "value" as const, insert: o, detail: a.label })), prefix) };
    }
    if (a && NAME_KIND_LIST[a.kind]) return { from, to, items: filterPrefix(srsNameItems(names[NAME_KIND_LIST[a.kind]], a.label, kw), prefix) };
    return null;
  }

  // ── grid / stack names ──
  if (/\bgrid\s+$/i.test(head)) return { from, to, items: filterPrefix(srsNameItems(names.grids, "grid", kw), prefix) };
  if (/\bstack\s+$/i.test(head)) return { from, to, items: filterPrefix(srsNameItems(names.stacks, "stack", kw), prefix) };

  // ── Flow words with a name ──
  const firstArg = new RegExp(`^\\s*${stmt}\\s+$`, "i").test(head);
  if (firstArg) {
    if (lstmt === "call") return { from, to, items: filterPrefix(srsNameItems(names.routines, "routine", kw), prefix) };
    if (lstmt === "goto") return { from, to, items: filterPrefix(srsNameItems(labelsIn(fullText), "label", kw), prefix) };
    if (lstmt === "stopwatch") return { from, to, items: filterPrefix(["start", "stop", "reset"].map(w => ({ label: w, kind: "value" as const, insert: w + " " })), prefix) };
    if (lstmt === "status") return { from, to, items: filterPrefix(["info", "warning", "error"].map(w => ({ label: w, kind: "value" as const, insert: w + " " })), prefix) };
    if (step) {
      const p0 = step.positional[0];
      if (p0?.kind === "target") {
        const items: SrsCompletion[] = [
          ...srsNameItems(names.points, "point", kw),
          { label: "here", kind: "flow", insert: "here", detail: "current position" },
          { label: "grid", kind: "flow", insert: "grid ", detail: "a grid cell" },
          { label: "stack", kind: "flow", insert: "stack ", detail: "a stack slot" },
        ];
        return { from, to, items: filterPrefix(items, prefix) };
      }
      if (p0 && NAME_KIND_LIST[p0.kind]) return { from, to, items: filterPrefix(srsNameItems(names[NAME_KIND_LIST[p0.kind]], p0.label, kw), prefix) };
    }
  }

  // ── After a `,` (or a positional) on a step line: the remaining named args ──
  if (step && (/,\s*$/.test(head) || (opts.explicit && /\s$/.test(head)))) {
    const used = new Set([...code.matchAll(/([A-Za-z_]\w*)\s*=(?!=)/g)].map(m => m[1]));
    const items = step.args.filter(a => !used.has(a.arg)).map<SrsCompletion>(a => ({
      label: a.arg, kind: "arg", insert: a.arg + "=",
      detail: a.unit ? `${a.label} (${a.unit})` : a.label, info: a.help,
    }));
    return items.length ? { from, to, items: filterPrefix(items, prefix) } : null;
  }

  // ── A bare word in an expression: functions ──
  if (prefix && data?.symbols?.functions.length && /^[A-Za-z_]/.test(prefix)) {
    const r = completionsAt(before, before.length, data.symbols, data.localVariables);
    if (r) return { from: r.start, to, items: r.items.map(i => ({ label: i.label, kind: "function", insert: i.insert, detail: i.detail })) };
  }
  return null;
}

/** Help for the statement on a line: the catalog syntax + description, or a flow form's. */
export function srsLineHelp(line: string, data: SrsCompletionData | null): { title: string; syntax: string; description: string } | null {
  const code = stripComment(line).trim();
  if (!code) return null;
  const word = /^([A-Za-z_]\w*)/.exec(code)?.[1];
  if (code.startsWith("$")) {
    const s = data?.steps.find(x => x.type === (/^\$\w+(\[[^\]]*\])?(\.\w+)?\s*=/.test(code) && !/^\$\w+\.\w+\(/.test(code) ? "SetVariable" : "ListOp"));
    return s ? { title: s.label, syntax: s.syntax, description: s.description } : null;
  }
  if (!word) return null;
  const step = findStepByKeyword(data, word);
  if (step) return { title: step.label, syntax: step.syntax, description: step.description };
  const f = FLOW_SNIPPETS.find(x => x.label === word.toLowerCase());
  return f ? { title: f.label, syntax: f.snippet.replace(/\$\{([^}]*)\}/g, "$1").replace(/\n\t?/g, " … "), description: f.detail } : null;
}
