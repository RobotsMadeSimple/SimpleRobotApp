// Simple Robot Script (SRS) tokenizer — colouring only (controller docs/program-language.md §6.3).
//
// The controller owns the real parser (ParseProgramText); this file only has to find where each
// token starts and ends so the editor can colour it. It is pure TS with no imports, so the same
// code runs in three places: CodeMirror on web (CodeEditor.web.tsx), the bundled CodeMirror in
// the native WebView (webviewEntry.ts → codeEditorBundle.generated.ts) and the node check
// (scripts/srs-tokens-check.mts).
//
// Keywords come from the step catalog (`keyword` + `aliases`); until it loads, the built-in list
// below is used. A word is only a statement keyword in statement position (the first word of a
// line that is not a continuation), so a point called `Wait` in `MoveL Wait` stays a name.

export type SrsTokenType =
  | "comment"    // # text
  | "section"    // ## Title (a Note section)
  | "pragma"     // #!srs 1
  | "attr"       // @name @off @id @with @program
  | "keyword"    // a step keyword: MoveL, SetOutput, RunVision …
  | "flow"       // if elif else end repeat while for switch case try catch call … (and grid/stack/here)
  | "decl"       // var computed param global persistent input monitor (+ types)
  | "variable"   // $name
  | "string"     // "…" text
  | "template"   // the { } of a string template
  | "escape"     // \" \\ \n \t inside a string
  | "number"
  | "unit"       // the ms / s suffix of a duration
  | "bool"       // on off true false
  | "argName"    // name in name=value
  | "name"       // repository names, enum words, routine names …
  | "operator"   // = == != < > + - * / and or not ->
  | "punct"      // ( ) [ ] { } , . :
  | "json"      // the raw JSON of @with / @program (shown dimmed, never hidden)
  | "error";     // an unterminated string, a stray character

export type SrsToken = { from: number; to: number; type: SrsTokenType };

/** Tokenizer state carried from one line to the next. */
export type SrsState = {
  /** Open ( [ { across lines — the line continues while > 0 (§6.3). */
  depth: number;
  /** The previous line ended in a top-level `,` — this line continues it. */
  continued: boolean;
  /** Still before the first token of a statement line. */
  atStatement: boolean;
  /** Inside a string: 0 no, 1 text, 2 inside a `{…}` template. */
  str: 0 | 1 | 2;
  /** Brace depth inside a template. */
  tplDepth: number;
  /** The last non-space token on this line, for `name =` and `-> $v` detection. */
  last: SrsTokenType | null;
  /** The statement keyword of this line (lower case), e.g. "movel" — "" before it. */
  stmt: string;
  /** End of a duration unit right after the number just returned (-1 = none). */
  unitEnd: number;
};

export function srsStartState(): SrsState {
  return { depth: 0, continued: false, atStatement: true, str: 0, tplDepth: 0, last: null, stmt: "", unitEnd: -1 };
}

export function copySrsState(s: SrsState): SrsState {
  return { ...s };
}

/** The words of the statement keywords, flow words and declarations. */
export type SrsKeywords = { steps: Set<string>; flow: Set<string>; decl: Set<string> };

/** Lower-case. Step keywords when no catalog is loaded yet (the StepType names). */
export const DEFAULT_STEP_KEYWORDS = [
  "MoveL", "MoveJ", "JumpL", "JumpJ", "MoveC", "ThreadMove", "RunHoming", "SetJointPosition", "CncProgram",
  "SavePosition", "SetSpeedL", "SetSpeedJ", "SetBlendRadius", "SetSpeedFactor", "SetTool", "SetLocal",
  "ClearLocal", "Wait", "SetOutput", "Tare", "ReadLoadCell", "StartRecording", "StopRecording", "ExportData",
  "AuxMove", "AuxContinuous", "AuxStop", "AuxEnable", "GripperAction", "ConveyorAction", "RotaryIndex",
  "RunVision", "CaptureImage", "SaveImage", "StartBackground", "StopBackground", "WaitForBackground",
  "HttpRequest", "HttpReceive",
];

/** Control words — statement forms plus the words that only appear inside them. */
export const FLOW_WORDS = [
  "if", "elif", "else", "end", "repeat", "forever", "as", "while", "for", "in", "switch", "case", "default",
  "try", "catch", "break", "continue", "return", "exit", "raise", "label", "goto", "call", "out", "pause",
  "status", "stopwatch", "prompt", "plugin", "unknown", "send", "receive", "grid", "stack", "here", "point",
];

export const DECL_WORDS = [
  "var", "computed", "param", "global", "persistent", "input", "monitor", "inout",
  "number", "bool", "string", "image", "list", "record",
];

const BOOL_WORDS = new Set(["on", "off", "true", "false"]);
const OP_WORDS = new Set(["and", "or", "not"]);

/** Build the keyword sets; `catalogKeywords` = every catalog step's keyword and aliases. */
export function srsKeywords(catalogKeywords?: Iterable<string>): SrsKeywords {
  const flow = new Set(FLOW_WORDS);
  const steps = new Set<string>();
  for (const k of catalogKeywords ?? DEFAULT_STEP_KEYWORDS) {
    const w = k.toLowerCase();
    if (!/^[a-z_]\w*$/.test(w)) continue; // "$" (SetVariable) and "#" (Note) are statement forms
    if (!flow.has(w)) steps.add(w);
  }
  return { steps, flow, decl: new Set(DECL_WORDS) };
}

const DEFAULT_KEYWORDS = srsKeywords();

const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdChar  = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit   = (c: string) => c >= "0" && c <= "9";

/**
 * The next token of `line` at `pos` (spaces already skipped by the caller), updating `st`.
 * Returns the token end and type.
 */
export function srsNextToken(line: string, pos: number, st: SrsState, kw: SrsKeywords = DEFAULT_KEYWORDS): { end: number; type: SrsTokenType } {
  const c = line[pos];
  const startOfStmt = st.atStatement;
  st.atStatement = false;

  // ── Inside a string ──
  if (st.str === 1) {
    if (c === "\\") return tok(Math.min(line.length, pos + 2), "escape", st);
    if (c === "{") { st.str = 2; st.tplDepth = 1; return tok(pos + 1, "template", st); }
    if (c === "\"") { st.str = 0; return tok(pos + 1, "string", st); }
    let i = pos;
    while (i < line.length && line[i] !== "\"" && line[i] !== "\\" && line[i] !== "{") i++;
    // An unterminated string ends at the line: strings never span lines (§6.3).
    if (i >= line.length) { st.str = 0; return tok(i, "error", st); }
    return tok(i, "string", st);
  }
  if (st.str === 2) {
    if (c === "{") { st.tplDepth++; return tok(pos + 1, "template", st); }
    if (c === "}") {
      if (--st.tplDepth <= 0) { st.str = 1; st.tplDepth = 0; }
      return tok(pos + 1, "template", st);
    }
    if (c === "\"") { st.str = 0; st.tplDepth = 0; return tok(pos + 1, "string", st); }
    // fall through: expression tokens inside the template
  }

  // ── Comments, sections, pragma ──
  if (c === "#" && st.str === 0) {
    const rest = line.slice(pos);
    if (pos === 0 || /^\s*$/.test(line.slice(0, pos))) {
      if (rest.startsWith("#!")) return tok(line.length, "pragma", st);
      if (/^##(\s|$)/.test(rest)) return tok(line.length, "section", st);
    }
    return tok(line.length, "comment", st);
  }

  // ── Attributes ──
  if (c === "@" && startOfStmt) {
    let i = pos + 1;
    while (i < line.length && isIdChar(line[i])) i++;
    const name = line.slice(pos + 1, i).toLowerCase();
    if (name === "with" || name === "program") st.stmt = "@json";
    return tok(i, "attr", st);
  }
  // The JSON after @with / @program: one dimmed token to the end of the line.
  if (st.stmt === "@json" && st.str === 0) return tok(line.length, "json", st);

  // ── Strings ──
  if (c === "\"") { st.str = 1; return tok(pos + 1, "string", st); }

  // ── Variables ──
  if (c === "$") {
    let i = pos + 1;
    while (i < line.length && isIdChar(line[i])) i++;
    if (startOfStmt) st.stmt = "$";
    return tok(i, "variable", st);
  }

  // ── Numbers (+ duration units) ──
  if (isDigit(c) || (c === "." && isDigit(line[pos + 1] ?? ""))) {
    let i = pos;
    while (i < line.length && isDigit(line[i])) i++;
    if (line[i] === "." && isDigit(line[i + 1] ?? "")) { i++; while (i < line.length && isDigit(line[i])) i++; }
    if ((line[i] === "e" || line[i] === "E") && /[+-]?\d/.test(line.slice(i + 1, i + 3))) {
      i++; if (line[i] === "+" || line[i] === "-") i++;
      while (i < line.length && isDigit(line[i])) i++;
    }
    // A unit suffix is its own token so it can be coloured; only ms and s are units (§6.3).
    const unit = /^(ms|s)(?![A-Za-z0-9_])/.exec(line.slice(i));
    if (unit) st.unitEnd = i + unit[1].length;
    return tok(i, "number", st);
  }
  if (st.unitEnd > pos) { const e = st.unitEnd; st.unitEnd = -1; return tok(e, "unit", st); }
  st.unitEnd = -1;

  // ── Words ──
  if (isIdStart(c)) {
    let i = pos;
    while (i < line.length && isIdChar(line[i])) i++;
    const word = line.slice(pos, i);
    const lw = word.toLowerCase();
    const after = line.slice(i);
    if (st.str === 2) return tok(i, OP_WORDS.has(lw) ? "operator" : BOOL_WORDS.has(lw) ? "bool" : "name", st);
    if (startOfStmt) {
      if (kw.decl.has(lw) && (lw === "var" || lw === "computed" || lw === "param" || lw === "global" || lw === "persistent" || lw === "input" || lw === "monitor")) {
        st.stmt = "decl";
        return tok(i, "decl", st);
      }
      if (kw.flow.has(lw)) { st.stmt = lw; return tok(i, "flow", st); }
      if (kw.steps.has(lw)) { st.stmt = lw; return tok(i, "keyword", st); }
    }
    if (st.stmt === "decl" && kw.decl.has(lw)) return tok(i, "decl", st);
    // name=value (not ==) is a named argument
    if (/^\s*=(?!=)/.test(after) && st.stmt !== "$" && st.stmt !== "decl") return tok(i, "argName", st);
    if (BOOL_WORDS.has(lw)) return tok(i, "bool", st);
    if (OP_WORDS.has(lw)) return tok(i, "operator", st);
    if (kw.flow.has(lw) && (lw === "grid" || lw === "stack" || lw === "here" || lw === "in" || lw === "as"
      || lw === "out" || lw === "forever" || lw === "send" || lw === "receive" || lw === "point"
      || (lw === "if" && st.stmt === "else"))) return tok(i, "flow", st);
    // Value words of the step forms: SetOutput … toggle, mapping rows `= list $v` / `= image $v`,
    // joints J1…J9.
    if (lw === "toggle" || ((lw === "list" || lw === "image") && st.last === "operator") || /^j[1-9]$/.test(lw)) return tok(i, "bool", st);
    return tok(i, "name", st);
  }

  // ── Operators and punctuation ──
  if (c === "-" && line[pos + 1] === ">") return tok(pos + 2, "operator", st);
  const two = line.slice(pos, pos + 2);
  if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") return tok(pos + 2, "operator", st);
  if ("([{".includes(c)) { if (st.str === 0) st.depth++; return tok(pos + 1, "punct", st); }
  if (")]}".includes(c)) { if (st.str === 0) st.depth = Math.max(0, st.depth - 1); return tok(pos + 1, "punct", st); }
  if (",.:".includes(c)) return tok(pos + 1, "punct", st);
  if ("=<>+-*/%!?^".includes(c)) return tok(pos + 1, "operator", st);
  return tok(pos + 1, "error", st);
}

function tok(end: number, type: SrsTokenType, st: SrsState) {
  st.last = type;
  return { end, type };
}

/** Called at the start of each line (before its first token). */
export function srsStartLine(st: SrsState) {
  st.atStatement = st.depth === 0 && !st.continued;
  st.str = 0;
  st.tplDepth = 0;
  st.last = null;
  if (st.atStatement) st.stmt = "";
}

/** Called at the end of each line, with the line's text. */
export function srsEndLine(st: SrsState, line: string) {
  // A trailing top-level comma continues the statement on the next line (§6.3).
  const code = stripComment(line).trimEnd();
  st.continued = st.depth === 0 && code.endsWith(",");
}

/** The line without its `#` comment (a `#` inside a string is kept). */
export function stripComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) { if (c === "\\") i++; else if (c === "\"") inStr = false; }
    else if (c === "\"") inStr = true;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

/** Tokenize one line from `state` (mutated to the state after the line). */
export function srsTokenizeLine(line: string, state: SrsState, kw: SrsKeywords = DEFAULT_KEYWORDS): SrsToken[] {
  srsStartLine(state);
  const out: SrsToken[] = [];
  let pos = 0;
  while (pos < line.length) {
    if (state.str !== 1 && (line[pos] === " " || line[pos] === "\t")) { pos++; continue; }
    const { end, type } = srsNextToken(line, pos, state, kw);
    const e = Math.max(end, pos + 1);
    out.push({ from: pos, to: e, type });
    pos = e;
  }
  srsEndLine(state, line);
  return out;
}

/** Tokenize a whole text, line by line. */
export function srsTokenize(text: string, kw: SrsKeywords = DEFAULT_KEYWORDS): SrsToken[][] {
  const st = srsStartState();
  return text.split(/\r?\n/).map(l => srsTokenizeLine(l, st, kw));
}

// ── CodeMirror StreamLanguage adapter ─────────────────────────────────────────
// Structurally a CodeMirror `StreamParser<SrsState>` (no import, so this file stays dependency
// free): pass it to `StreamLanguage.define(...)`. `kw()` is read per token so a catalog that
// loads later takes effect on the next re-highlight.

type StreamLike = {
  pos: number; string: string;
  sol(): boolean; eol(): boolean; eatSpace(): boolean; skipToEnd(): void;
};

/** CodeMirror tag names for each token type (StreamLanguage maps these to highlight tags). */
export const SRS_TOKEN_TAGS: Record<SrsTokenType, string> = {
  comment: "comment",
  section: "heading",
  pragma: "meta",
  attr: "attributeName",
  keyword: "keyword",
  flow: "controlKeyword",
  decl: "definitionKeyword",
  variable: "variableName",
  string: "string",
  template: "string.special",
  escape: "escape",
  number: "number",
  unit: "unit",
  bool: "bool",
  argName: "propertyName",
  name: "labelName",
  operator: "operator",
  punct: "punctuation",
  json: "meta",
  error: "invalid",
};

export function srsStreamParser(kw: () => SrsKeywords) {
  return {
    name: "srs",
    startState: srsStartState,
    copyState: copySrsState,
    token(stream: StreamLike, state: SrsState): string | null {
      if (stream.sol()) srsStartLine(state);
      if (state.str !== 1 && stream.eatSpace()) { if (stream.eol()) srsEndLine(state, stream.string); return null; }
      const { end, type } = srsNextToken(stream.string, stream.pos, state, kw());
      stream.pos = Math.max(end, stream.pos + 1);
      if (stream.eol()) srsEndLine(state, stream.string);
      return SRS_TOKEN_TAGS[type];
    },
    blankLine(state: SrsState) { srsStartLine(state); srsEndLine(state, ""); },
    languageData: { commentTokens: { line: "#" } },
  };
}
