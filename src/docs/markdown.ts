// A small Markdown parser for the subset the programming manual uses — no dependencies, so the
// manual renders natively (see src/components/docs/MarkdownView.tsx) on web, Android and Electron.
//
// Blocks: ATX headings (# … ####, optional {#id}), paragraphs, bullet / numbered lists (nested by
// indent), GFM pipe tables, fenced code (``` lang), block quotes (callouts: "> **Note:**" or
// "> [!NOTE]"), a lone image line (a figure), horizontal rules. HTML comments are dropped.
// Inlines: `code`, **strong**, *em* / _em_, ~~strike~~, [text](href), ![alt](src), <url>, \escapes.

export type Inline =
  | { t: "text"; text: string }
  | { t: "code"; text: string }
  | { t: "strong"; children: Inline[] }
  | { t: "em"; children: Inline[] }
  | { t: "del"; children: Inline[] }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "image"; src: string; alt: string; title?: string }
  | { t: "br" };

export type ListItem = { children: Block[]; checked?: boolean };

export type CalloutKind = "note" | "tip" | "warning" | "caution" | "important";

export type Block =
  | { t: "heading"; level: number; id: string; text: string; children: Inline[] }
  | { t: "paragraph"; children: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "table"; align: ("left" | "center" | "right" | null)[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; lang: string; text: string }
  | { t: "quote"; callout: CalloutKind | null; children: Block[] }
  | { t: "figure"; src: string; alt: string; title?: string }
  | { t: "hr" };

/** GitHub-style heading slug: lower case, spaces → "-", punctuation dropped. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~[\]()]/g, "")
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Plain text of inline nodes (search, slugs, accessibility). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map(n => {
    switch (n.t) {
      case "text": case "code": return n.text;
      case "image": return n.alt;
      case "br": return " ";
      default: return inlineText(n.children);
    }
  }).join("");
}

// ── Block parsing ────────────────────────────────────────────────────────────

const RE_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_BULLET = /^(\s*)([-*+])\s+(.*)$/;
const RE_ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RE_FIGURE = /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)\s*$/;

export function parseMarkdown(src: string): Block[] {
  const text = src.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const used = new Map<string, number>();
  return parseBlocks(text.split("\n"), used);
}

function uniqueId(base: string, used: Map<string, number>): string {
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

function isBlank(l: string) { return /^\s*$/.test(l); }

function startsBlock(l: string): boolean {
  return RE_HEADING.test(l) || RE_FENCE.test(l) || RE_HR.test(l) || RE_BULLET.test(l) || RE_ORDERED.test(l)
    || /^\s*>/.test(l) || RE_FIGURE.test(l);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (c === "`") inCode = !inCode;
    if (c === "|" && !inCode) { cells.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseBlocks(lines: string[], used: Map<string, number>): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // Fenced code
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const indent = fence[1].length;
      const marker = fence[2];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i].slice(Math.min(indent, lines[i].length - lines[i].trimStart().length)));
        i++;
      }
      i++; // closing fence
      out.push({ t: "code", lang: fence[3].toLowerCase(), text: body.join("\n") });
      continue;
    }

    // Heading
    const h = RE_HEADING.exec(line);
    if (h) {
      let raw = h[2];
      let id: string | null = null;
      const explicit = /\s*\{#([\w-]+)\}\s*$/.exec(raw);
      if (explicit) { id = explicit[1]; raw = raw.slice(0, explicit.index); }
      const children = parseInline(raw);
      const plain = inlineText(children);
      out.push({ t: "heading", level: h[1].length, id: id ?? uniqueId(slugify(plain), used), text: plain, children });
      i++;
      continue;
    }

    if (RE_HR.test(line)) { out.push({ t: "hr" }); i++; continue; }

    // Figure (an image alone on its line)
    const fig = RE_FIGURE.exec(line);
    if (fig) { out.push({ t: "figure", alt: fig[1], src: fig[2], title: fig[3] }); i++; continue; }

    // Block quote / callout
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      let callout: CalloutKind | null = null;
      const gh = /^\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i.exec(body[0] ?? "");
      if (gh) { callout = gh[1].toLowerCase() as CalloutKind; body.shift(); }
      else {
        const bold = /^\s*\*\*(Note|Tip|Warning|Caution|Important|Danger)\b/i.exec(body[0] ?? "");
        if (bold) callout = (bold[1].toLowerCase() === "danger" ? "caution" : bold[1].toLowerCase()) as CalloutKind;
      }
      out.push({ t: "quote", callout, children: parseBlocks(body, used) });
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(c => {
        const l = c.startsWith(":"), r = c.endsWith(":");
        return l && r ? "center" as const : r ? "right" as const : l ? "left" as const : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        while (cells.length < head.length) cells.push("");
        rows.push(cells.slice(0, head.length).map(parseInline));
        i++;
      }
      out.push({ t: "table", align: head.map((_, k) => align[k] ?? null), head: head.map(parseInline), rows });
      continue;
    }

    // List
    const lm = RE_BULLET.exec(line) ?? RE_ORDERED.exec(line);
    if (lm) {
      const res = parseList(lines, i, used);
      out.push(res.block);
      i = res.next;
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && (para.length === 0 || !startsBlock(lines[i]))) {
      if (para.length > 0 && lines[i].includes("|") && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) break;
      para.push(lines[i]);
      i++;
    }
    out.push({ t: "paragraph", children: parseInline(joinParagraph(para)) });
  }
  return out;
}

/** Join paragraph lines: a trailing two spaces or backslash is a hard break, else a space. */
function joinParagraph(lines: string[]): string {
  let s = "";
  lines.forEach((l, k) => {
    const last = k === lines.length - 1;
    if (!last && /( {2,}|\\)$/.test(l)) s += l.replace(/( {2,}|\\)$/, "") + " ";
    else s += l.trim() + (last ? "" : " ");
  });
  return s.trim();
}

function parseList(lines: string[], start: number, used: Map<string, number>): { block: Block; next: number } {
  const first = (RE_BULLET.exec(lines[start]) ?? RE_ORDERED.exec(lines[start]))!;
  const baseIndent = first[1].length;
  const ordered = /^\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = ordered ? RE_ORDERED.exec(lines[i]) : RE_BULLET.exec(lines[i]);
    if (!m || m[1].length !== baseIndent) break;
    const contentIndent = m[1].length + m[2].length + 1;
    const body: string[] = [m[3]];
    i++;
    // Continuation: indented lines (nested lists, wrapped text) and blank lines followed by indented ones.
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        const nxt = lines[i + 1];
        if (nxt !== undefined && !isBlank(nxt) && nxt.length - nxt.trimStart().length > baseIndent) { body.push(""); i++; continue; }
        break;
      }
      const ind = l.length - l.trimStart().length;
      if (ind > baseIndent) { body.push(l.slice(Math.min(ind, contentIndent))); i++; continue; }
      if (!startsBlock(l) && !/^\s*\|/.test(l)) { body.push(l.trim()); i++; continue; } // lazy continuation
      break;
    }
    let checked: boolean | undefined;
    const task = /^\[([ xX])\]\s+/.exec(body[0]);
    if (task) { checked = task[1] !== " "; body[0] = body[0].slice(task[0].length); }
    items.push({ children: parseBlocks(body, used), checked });
  }
  return { block: { t: "list", ordered, start: ordered ? Number(first[2]) : 1, items }, next: i };
}

// ── Inline parsing ───────────────────────────────────────────────────────────

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", text: buf }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === "\\" && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!|<>~]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (c === " ") { flush(); out.push({ t: "br" }); i++; continue; }

    if (c === "`") {
      let n = 1;
      while (src[i + n] === "`") n++;
      const ticks = "`".repeat(n);
      const end = src.indexOf(ticks, i + n);
      if (end > 0) {
        flush();
        let code = src.slice(i + n, end);
        if (/^ .* $/.test(code)) code = code.slice(1, -1);
        out.push({ t: "code", text: code });
        i = end + n;
        continue;
      }
    }

    if (c === "!" && src[i + 1] === "[") {
      const link = matchLink(src, i + 1);
      if (link) {
        flush();
        out.push({ t: "image", alt: link.text, src: link.href, title: link.title });
        i = link.end;
        continue;
      }
    }

    if (c === "[") {
      const link = matchLink(src, i);
      if (link) {
        flush();
        out.push({ t: "link", href: link.href, children: parseInline(link.text) });
        i = link.end;
        continue;
      }
    }

    if (c === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(src.slice(i));
      if (auto) { flush(); out.push({ t: "link", href: auto[1], children: [{ t: "text", text: auto[1] }] }); i += auto[0].length; continue; }
    }

    if ((c === "*" || c === "_" || c === "~") ) {
      let n = 1;
      while (src[i + n] === c && n < 3) n++;
      // `_` inside a word (snake_case) is literal.
      const prev = src[i - 1] ?? " ";
      const next = src[i + n] ?? " ";
      const intraword = c === "_" && /\w/.test(prev);
      if (!intraword && !/\s/.test(next) && !(c === "~" && n < 2)) {
        const marker = c.repeat(n);
        const end = findClose(src, i + n, marker);
        if (end > 0) {
          flush();
          const inner = parseInline(src.slice(i + n, end));
          if (c === "~") out.push({ t: "del", children: inner });
          else if (n === 3) out.push({ t: "strong", children: [{ t: "em", children: inner }] });
          else if (n === 2) out.push({ t: "strong", children: inner });
          else out.push({ t: "em", children: inner });
          i = end + n;
          continue;
        }
      }
      buf += src.slice(i, i + n);
      i += n;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

function findClose(src: string, from: number, marker: string): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === "`") { const e = src.indexOf("`", i + 1); if (e < 0) return -1; i = e + 1; continue; }
    if (src.startsWith(marker, i) && !/\s/.test(src[i - 1] ?? "") && src[i + marker.length] !== marker[0]) {
      if (marker[0] === "_" && /\w/.test(src[i + marker.length] ?? "")) { i++; continue; }
      return i;
    }
    i++;
  }
  return -1;
}

function matchLink(src: string, open: number): { text: string; href: string; title?: string; end: number } | null {
  let depth = 0;
  let k = open;
  for (; k < src.length; k++) {
    if (src[k] === "\\") { k++; continue; }
    if (src[k] === "[") depth++;
    else if (src[k] === "]") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0 || src[k + 1] !== "(") return null;
  const m = /^\(\s*<?([^)\s>]*)>?(?:\s+"([^"]*)")?\s*\)/.exec(src.slice(k + 1));
  if (!m) return null;
  return { text: src.slice(open + 1, k), href: m[1], title: m[2], end: k + 1 + m[0].length };
}
