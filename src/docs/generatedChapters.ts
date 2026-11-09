// The reference chapters the manifest marks `generated` (instructions, functions, error codes,
// keywords) have no Markdown of their own — their sections are built here from the bundled
// reference.json, as Markdown the native renderer then draws like any other chapter (tables,
// headings for the jump list, links to instruction pages, and they are searchable).

import {
  ERROR_CODES, FUNCTIONS, IO_NAMES, KEYWORDS, PROBLEM_CODES, PROPERTIES, REFERENCE, REFERENCE_CATEGORIES,
} from "./content/reference";
import type { GeneratedSection } from "./types";

/** A table cell: one line, pipes escaped. */
const cell = (s: string | undefined) => (s ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "—";
const code = (s: string) => "`" + s.replace(/`/g, "'").replace(/\|/g, "\\|") + "`";
const stepLink = (type: string, label?: string) => {
  const e = REFERENCE.find(x => x.type === type);
  return e ? `[${code(label ?? e.keyword)}](ref:${e.type})` : code(label ?? type);
};

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function steps(): string {
  const order = REFERENCE_CATEGORIES.map(c => c.key);
  const cats = [...order, ...REFERENCE.map(e => e.category).filter(k => !order.includes(k))]
    .filter((k, i, a) => a.indexOf(k) === i);
  return cats.map(key => {
    const cat = REFERENCE_CATEGORIES.find(c => c.key === key);
    const list = REFERENCE.filter(e => e.category === key);
    if (list.length === 0) return "";
    return [
      `## ${cat?.label ?? key}`,
      cat?.description ?? "",
      table(["Instruction", "Block", "What it does"], list.map(e => [stepLink(e.type), cell(e.name), cell(e.description)])),
    ].filter(Boolean).join("\n\n");
  }).filter(Boolean).join("\n\n");
}

function functions(): string {
  const groups = [...new Set(PROPERTIES.map(p => p.group ?? ""))];
  return [
    "## Functions",
    table(["Function", "Description"], FUNCTIONS.map(f => [code(f.signature), cell(f.description)])),
    "## Properties",
    ...groups.flatMap(g => [
      ...(g ? [`### ${g.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}`] : []),
      table(["Property", "Type", "Description"], PROPERTIES.filter(p => (p.group ?? "") === g).map(p => [code(p.name), cell(p.type), cell(p.description)])),
    ]),
    ...(IO_NAMES.length ? ["## I/O names", table(["Name", "Description"], IO_NAMES.map(io => [code(io.name), cell(io.description)]))] : []),
  ].join("\n\n");
}

function errorCodes(): string {
  const problemTitle = (k: string) => `${k.replace(/^./, c => c.toUpperCase())} problems`;
  return [
    "## Runtime error codes",
    "A Try step's catch can match these with `only=(…)`; the code is in `code=$var`.",
    table(["Code", "Meaning", "Catchable", "Raised by"], ERROR_CODES.map(e => [
      code(e.code),
      `**${cell(e.label)}** — ${cell(e.description)}`,
      e.catchable ? "Yes" : "No",
      e.raisedBy?.length ? e.raisedBy.map(t => stepLink(t)).join(", ") : "—",
    ])),
    ...Object.entries(PROBLEM_CODES).flatMap(([k, list]) => [
      `## ${problemTitle(k)}`,
      table(list.some(p => p.severity) ? ["Code", "Severity", "Meaning"] : ["Code", "Meaning"],
        list.map(p => (list.some(x => x.severity)
          ? [code(p.code), cell(p.severity), cell(p.meaning)]
          : [code(p.code), cell(p.meaning)]))),
    ]),
  ].join("\n\n");
}

function keywords(): string {
  const words = (list: string[]) => list.map(code).join(", ");
  return [
    "## Statement keywords",
    table(["Keyword", "Block"], KEYWORDS.statements.map(s => [stepLink(s.type, s.word), cell(s.name)])),
    "## Flow words",
    words(KEYWORDS.flow),
    "## Declarations and types",
    words(KEYWORDS.declarations),
    "## Values and operators",
    words(KEYWORDS.values),
    "## Attributes",
    words(KEYWORDS.attributes),
  ].join("\n\n");
}

export function generatedMarkdown(section: GeneratedSection | string): string {
  switch (section) {
    case "steps": return steps();
    case "functions": return functions();
    case "errorCodes": return errorCodes();
    case "keywords": return keywords();
    default: return "";
  }
}
