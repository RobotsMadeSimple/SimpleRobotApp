import { ExpressionSymbols, ProgramVariable } from "@/src/models/robotModels";

export type CompletionKind = "variable" | "property" | "io" | "function";

export type Completion = {
  kind: CompletionKind;
  /** What the chip shows, e.g. `$robot.x` or `clamp`. */
  label: string;
  /** Text that replaces the token being typed. */
  insert: string;
  detail?: string;
};

/** Words the evaluator treats as operators or literals, never as function names. */
const KEYWORDS = new Set(["and", "or", "not", "true", "false"]);
const MAX = 8;

/**
 * Suggestions for the token that ends at `cursor`:
 * - after `$` (optionally with part of a name): variables, properties and IO names;
 * - after a bare word that is not a keyword: function names, inserted with `(`.
 */
export function completionsAt(
  text: string,
  cursor: number,
  symbols: ExpressionSymbols | null,
  localVariables: ProgramVariable[],
): { start: number; items: Completion[] } | null {
  const before = text.slice(0, cursor);

  const sigil = /\$([A-Za-z_][\w.]*)?$/.exec(before);
  if (sigil) {
    const prefix = (sigil[1] ?? "").toLowerCase();
    const seen = new Set<string>();
    const items: Completion[] = [];
    const add = (kind: CompletionKind, name: string, detail?: string) => {
      const key = name.toLowerCase();
      if (seen.has(key) || !key.startsWith(prefix) || key === prefix) return;
      seen.add(key);
      items.push({ kind, label: `$${name}`, insert: `$${name}`, detail });
    };
    localVariables.forEach(v => add("variable", v.name, v.description));
    symbols?.variables.forEach(v => add("variable", v.name, v.isGlobal ? "global" : undefined));
    symbols?.properties.forEach(p => add("property", p.name, p.description));
    symbols?.io.forEach(i => add("io", i.name, i.description));
    // Before any letter is typed, the program's own variables are the likely pick;
    // with a prefix, shorter names first reads like a normal autocomplete.
    if (prefix) items.sort((a, b) => a.label.length - b.label.length);
    return items.length ? { start: sigil.index, items: items.slice(0, MAX) } : null;
  }

  const word = /(^|[^\w$.\]])([A-Za-z_]\w*)$/.exec(before);
  if (word && symbols?.functions.length) {
    const prefix = word[2].toLowerCase();
    if (KEYWORDS.has(prefix)) return null;
    const items = symbols.functions
      .filter(f => f.name.toLowerCase().startsWith(prefix))
      .slice(0, MAX)
      .map<Completion>(f => ({ kind: "function", label: f.name, insert: `${f.name}(`, detail: f.signature }));
    return items.length ? { start: before.length - word[2].length, items } : null;
  }
  return null;
}

/** `text` with the token from `start` to `cursor` replaced by `insert`. */
export function applyCompletion(text: string, start: number, cursor: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(cursor);
}

/** Insert `token` at `cursor`, spacing it off a preceding word or value. */
export function insertAt(text: string, cursor: number, token: string): string {
  const before = text.slice(0, cursor);
  const pad = before.length > 0 && /[\w)\]]$/.test(before) ? " " : "";
  return before + pad + token + text.slice(cursor);
}

/** `$name` roots an expression references — `$pts[0].x` gives `pts`, `$robot.x` gives `robot.x`. */
export function referencedNames(expression: string): string[] {
  return [...expression.matchAll(/\$([A-Za-z_][\w.]*)/g)].map(m => m[1].replace(/\.$/, ""));
}
