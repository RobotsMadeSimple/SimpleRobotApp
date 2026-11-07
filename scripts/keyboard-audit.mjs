#!/usr/bin/env node
// Keyboard audit — proves every text field stays visible while the (mock) keyboard is up.
//
// Runs the web build in headless Chromium at phone size with the app's mock keyboard enabled
// (src/components/dev/MockKeyboard.tsx), walks a list of scenarios (a route plus the taps that open
// a modal/sheet), focuses every text field it finds, and checks that the focused field:
//   • sits fully above the keyboard's top edge,
//   • is inside the viewport, and
//   • is actually the element under its own centre (nothing else is drawn over it).
// A failing field gets a screenshot in scripts/keyboard-audit-out/. Exit code 1 if anything fails.
//
// Prereqs: Expo web dev server on :8081 and a controller on :9000 (the virtual one is fine).
//   npm run keyboard-audit            # all scenarios
//   npm run keyboard-audit -- aux     # scenarios whose name contains "aux"
// Add a scenario below whenever a screen gains a text field inside a modal or sheet.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.APP_URL || "http://localhost:8081";
const CONTROLLER = process.env.CTRL_HOST || "localhost";
const KEYBOARD = process.env.MOCK_KEYBOARD || "42%";   // Fold-ish: the IME takes ~40-48% of the screen
const VIEWPORT = { width: 412, height: 915 };
const OUT = join(dirname(fileURLToPath(import.meta.url)), "keyboard-audit-out");
const filter = process.argv.slice(2).join(" ").trim().toLowerCase();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = (p, t, exact = true) => p.getByText(t, { exact });
const tap = async (p, t, { exact = true, nth = 0, last = false } = {}) => {
  const e = text(p, t, exact);
  await (last ? e.last() : e.nth(nth)).click({ force: true });
};

// A vision program built from generic tools: a filtered image layer, a line that locates the part
// (a fixture), a gridded pixel count and a blob that follow it, a corner, and a fixture made from
// two tools. Covers every text field kind: names, numeric steppers, limits and filter params.
const AUDIT_VISION_PROGRAM = {
  id: "", name: "zz keyboard audit", description: "", cameraId: "", lastUpdatedUnixMs: 0,
  layers: [{ id: "l1", name: "Soft gray", input: "camera", filters: [
    { id: "f1", type: "blur", enabled: true, size: 5 },
    { id: "f2", type: "threshold", enabled: true, mode: "adaptive", low: 128, high: 255, blockSize: 31, c: 5, invert: false }] }],
  tools: [
    { id: "t1", name: "Top edge", type: "findLine", enabled: true, input: "l1", fixtureId: null,
      region: { shape: "rect", x: 0.2, y: 0.1, width: 0.6, height: 0.1, rotation: 0 }, grid: null,
      limits: { angle: { min: -5, max: 5 } }, includeInPass: true, reference: null,
      params: { probes: 8, polarity: "any", contrast: 20, smoothing: 1, ignore: 0 } },
    { id: "t2", name: "Squares", type: "pixelCount", enabled: true, input: "camera", fixtureId: "t1",
      region: { shape: "quad", points: [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }] },
      grid: { rows: 4, cols: 4, inset: 0.2 }, limits: { percent: { min: 40, max: null } }, includeInPass: true, reference: null,
      params: { mode: "gray", colors: [], grayMin: 0, grayMax: 90 } },
    { id: "t3", name: "Holes", type: "blob", enabled: true, input: "l1", fixtureId: "t1",
      region: { shape: "circle", cx: 0.5, cy: 0.55, radius: 0.2 }, grid: null,
      limits: { count: { min: 2, max: 4 } }, includeInPass: true, reference: null,
      params: { polarity: "dark", threshold: "fixed", level: 100, minArea: 100, maxArea: 100000, minCircularity: 0.5, sort: "area", maxCount: 10 } },
    { id: "t4", name: "Left corner", type: "findCorner", enabled: true, input: "camera", fixtureId: null,
      region: { shape: "rect", x: 0.1, y: 0.1, width: 0.3, height: 0.06, rotation: 0 }, grid: null, limits: {}, includeInPass: true, reference: null,
      params: { probes: 8, polarity: "any", contrast: 20, smoothing: 1, ignore: 0, regionB: { shape: "rect", x: 0.1, y: 0.1, width: 0.06, height: 0.3, rotation: 0 } } },
    { id: "t5", name: "Part frame", type: "makeFixture", enabled: true, input: "camera", fixtureId: null, grid: null, limits: {},
      includeInPass: true, reference: null, params: { mode: "twoPoints", sources: ["t4", "t1"] } },
  ],
};

// ── Scenarios ─────────────────────────────────────────────────────────────────
// `open` gets the page after the route has loaded and must leave the fields to audit on screen.
const SCENARIOS = [
  {
    name: "aux gripper — Move to Gap sheet",
    route: "/io/auxiliary?deviceId=AUX_STEPPER_001",
    open: async p => { await p.getByLabel("Move to an exact gap").first().click({ force: true }); await sleep(500); },
  },
  {
    name: "aux axis — Set Position sheet",
    route: "/io/auxiliary?deviceId=AUX_STEPPER_001",
    open: async p => { await p.getByLabel("Set position").first().click({ force: true }); await sleep(500); },
  },
  {
    name: "builder — Wait step modal",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Variables & Timing", { exact: false }); await sleep(400);
      await tap(p, "Wait"); await sleep(900);
    },
  },
  {
    name: "builder — Loop (while) step modal",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Logic & Flow", { exact: false }); await sleep(400);
      await tap(p, "Loop"); await sleep(900);
      await tap(p, "While", { last: true }); await sleep(400);
      await p.getByLabel("Add condition").first().click({ force: true }); await sleep(400);
    },
  },
  {
    // Move step → "Blend Into Next Move" add-row → sub-page with the blend radius field.
    name: "builder — MoveL blend sub-page",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Move Linear"); await sleep(900);
      await tap(p, "Blend Into Next Move"); await sleep(400);
    },
  },
  {
    // Jump step → "Blend Apex Corners" add-row → the same blend sub-page.
    name: "builder — JumpL blend sub-page",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Jump Linear"); await sleep(900);
      await tap(p, "Blend Apex Corners"); await sleep(400);
    },
  },
  {
    // Move step → "Stop on Condition" add-row → sub-page → one condition row (an ExpressionField).
    name: "builder — MoveL stop-on-condition sub-page",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Move Linear"); await sleep(900);
      await tap(p, "Stop on Condition"); await sleep(400);
      await p.getByLabel("Add condition").first().click({ force: true }); await sleep(400);
    },
  },
  {
    // A variable field's picker → "+ New … variable" → the variable editor, opened from inside
    // the step modal (three layers deep); its name/value fields must still clear the keyboard.
    name: "builder — new variable from a step field",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Move Linear"); await sleep(900);
      await tap(p, "Stop on Condition"); await sleep(400);
      await p.getByLabel("Record position variable").first().click({ force: true }); await sleep(500);
      await p.getByLabel("New Points list variable").first().click({ force: true }); await sleep(700);
    },
  },
  {
    // A text-template field (Select Point → Variable) in a program with no variables yet: its
    // insert chip offers "+ New string variable", opening the same editor from a 4th layer.
    name: "builder — new variable from the point expression",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Move Linear"); await sleep(900);
      await tap(p, "Point", { exact: false }); await sleep(600);
      await tap(p, "Variable"); await sleep(400);
      await p.getByPlaceholder("$target", { exact: false }).first().click(); await sleep(400);
      await tap(p, "＋ $Variable"); await sleep(500);
      await p.getByLabel("New string variable").first().click({ force: true }); await sleep(700);
    },
  },
  {
    // Same sub-page from an aux move (GripperAction), whose main page is an inline body.
    name: "builder — Gripper stop-on-condition sub-page",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "I/O & Aux Axes", { exact: false }); await sleep(400);
      await tap(p, "Gripper"); await sleep(900);
      await tap(p, "Stop on Condition"); await sleep(400);
      await p.getByLabel("Add condition").first().click({ force: true }); await sleep(400);
    },
  },
  {
    name: "builder — Add Variable modal",
    route: "/program/builder",
    open: async p => { await tap(p, "Add Variable"); await sleep(800); },
  },
  {
    name: "builder — program name + description (page)",
    route: "/program/builder",
    open: async () => {},
  },
  // Program editor v2 (package E): the step search field, the catalog-driven fields of the new
  // blocks (on phones the step editor is a full page — its fields must still clear the keyboard),
  // the Switch case-values editor and teach-here's new point name.
  {
    name: "builder — step search (page)",
    route: "/program/builder",
    open: async p => { await p.getByLabel("Find", { exact: true }).locator("visible=true").first().click({ force: true }); await sleep(500); },
  },
  ...[
    ["Prompt step (catalog fields)", "Communication", "Prompt", async p => {
      await p.getByLabel("Input: Number").locator("visible=true").first().click({ force: true }); await sleep(400);
    }],
    ["Raise Error step", "Logic & Flow", "Raise Error"],
    ["Note step", "Logic & Flow", "Note"],
    ["Try step (retries + own error code)", "Logic & Flow", "Try", async p => {
      await p.getByLabel("Add your own code").locator("visible=true").first().click({ force: true }); await sleep(400);
    }],
    ["List step fields", "Variables & Timing", "List", async p => {
      await p.getByLabel("Add field row").locator("visible=true").first().click({ force: true }); await sleep(400);
    }],
    ["Set Speed Factor step", "Motion Settings", "Set Speed Factor"],
    ["End Program step", "Logic & Flow", "End Program"],
    ["Move Arc via variable", "Motion", "Move Arc", async p => {
      await p.getByLabel("Via point: variable").locator("visible=true").first().click({ force: true }); await sleep(400);
    }],
  ].map(([what, category, tile, more]) => ({
    name: `builder — ${what}`,
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, category, { exact: false }); await sleep(400);
      await tap(p, tile); await sleep(900);
      if (more) await more(p);
    },
  })),
  {
    // Close the new Switch's editor, then open the case-values editor from the block's case card.
    name: "builder — Switch case values",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Logic & Flow", { exact: false }); await sleep(400);
      await tap(p, "Switch"); await sleep(900);
      const done = p.getByLabel("Done", { exact: true }).locator("visible=true");
      if (await done.count()) await done.first().click({ force: true });
      else await tap(p, "Save");
      await sleep(700);
      await p.getByLabel("Edit values of case 1").locator("visible=true").first().click({ force: true }); await sleep(600);
      await p.getByLabel("Add value").locator("visible=true").first().click({ force: true }); await sleep(300);
    },
  },
  {
    // Move step → Point → "Save current position as a new point…" (needs a connected robot).
    name: "builder — teach a new point from the move target",
    route: "/program/builder",
    open: async p => {
      await tap(p, "Add Step"); await sleep(600);
      await tap(p, "Motion", { exact: false }); await sleep(400);
      await tap(p, "Move Linear"); await sleep(900);
      await tap(p, "Point", { exact: false }); await sleep(600);
      await p.getByLabel("Save current position as new point").locator("visible=true").first().click({ force: true }); await sleep(500);
    },
  },
  {
    name: "space — grid teaching wizard setup (page)",
    route: "/space/grid-teach",
    open: async () => {},
  },
  // Vision editor on an inline, never-saved program: each tool's settings page and the layer page.
  {
    name: "vision — editor (page)",
    route: "/program/vision-editor?program=" + encodeURIComponent(JSON.stringify(AUDIT_VISION_PROGRAM)),
    open: async () => {},
  },
  ...[["find line", "Top edge"], ["gridded pixel count", "Squares"], ["blob", "Holes"], ["find corner", "Left corner"], ["make fixture", "Part frame"]].map(([kind, label]) => ({
    name: `vision — ${kind} tool settings (page)`,
    route: "/program/vision-editor?program=" + encodeURIComponent(JSON.stringify(AUDIT_VISION_PROGRAM)),
    open: async p => { await tap(p, label); await sleep(900); },
  })),
  {
    name: "vision — image layer filters (page)",
    route: "/program/vision-editor?program=" + encodeURIComponent(JSON.stringify(AUDIT_VISION_PROGRAM)),
    open: async p => { await tap(p, "Soft gray"); await sleep(900); },
  },
  {
    name: "IO configure (page)",
    route: "/io/configure?deviceId=ROBOT_NANO_001",
    open: async () => {},
  },
];

// ── Audit ─────────────────────────────────────────────────────────────────────
async function auditFields(p, scenario, report) {
  // Text-entry fields only: RN-web renders Switch as <input type=checkbox>, which raises no keyboard.
  const NON_TEXT = ["hidden", "checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"];
  const sel = `input:not([disabled])${NON_TEXT.map(t => `:not([type=${t}])`).join("")}, textarea:not([disabled])`;
  const handles = await p.locator(sel).elementHandles();
  let n = 0;
  for (const h of handles) {
    const visible = await h.evaluate(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    });
    if (!visible) continue;
    const label = await h.evaluate(el => el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.id || el.name || `${el.tagName.toLowerCase()}#${[...document.querySelectorAll("input,textarea")].indexOf(el)}`);
    // A field the user can't reach right now (behind a modal's backdrop) isn't part of this
    // scenario — skip it rather than fail it. The user would scroll to an off-screen one, so do that.
    const reachable = await h.evaluate(el => {
      el.scrollIntoView?.({ block: "nearest" });
      const r = el.getBoundingClientRect();
      const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!under && (under === el || el.contains(under) || under.contains(el));
    });
    if (!reachable) continue;
    n++;
    // The modal card holding the field (a rounded, overflow-hidden box that doesn't reach the
    // bottom edge — bottom sheets are meant to lift, so they're left out). Its height must not
    // change when the keyboard opens: the footer stays put and the keyboard draws over it.
    const cardHeight = () => h.evaluate(el => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a), r = a.getBoundingClientRect();
        if (cs.overflow === "hidden" && parseFloat(cs.borderTopLeftRadius) >= 8 && r.height > 150)
          return r.bottom < window.innerHeight - 4 ? Math.round(r.height) : null;
      }
      return null;
    });
    const cardBefore = await cardHeight();
    await h.click({ force: true }).catch(() => {});
    await sleep(600); // let the app lift/scroll in response to the keyboard

    const result = await h.evaluate(el => {
      const r = el.getBoundingClientRect();
      const kb = window.__mockKeyboard || {};
      const top = kb.visible ? kb.top : window.innerHeight;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const under = document.elementFromPoint(cx, cy);
      const focused = document.activeElement === el;
      const covered = under && under !== el && !el.contains(under);
      const coveredBy = covered ? (under.getAttribute("data-testid") || under.tagName.toLowerCase() + (under.className ? "." + String(under.className).split(" ")[0] : "")) : null;
      return {
        focused, keyboardUp: !!kb.visible, keyboardTop: top,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        aboveKeyboard: r.bottom <= top + 0.5, inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
        covered: !!covered, coveredBy,
      };
    });
    const cardAfter = cardBefore == null ? null : await cardHeight();
    const cardMoved = cardBefore != null && cardAfter != null && Math.abs(cardAfter - cardBefore) > 2;
    const pass = result.focused && result.keyboardUp && result.aboveKeyboard && result.inViewport && !result.covered && !cardMoved;
    const why = !result.focused ? "field did not take focus"
      : !result.keyboardUp ? "mock keyboard did not appear (is it enabled?)"
      : !result.aboveKeyboard ? `field bottom ${result.bottom}px is below keyboard top ${result.keyboardTop}px`
      : !result.inViewport ? `field (${result.top}–${result.bottom}px) is off-screen`
      : result.covered ? `field is covered by ${result.coveredBy}`
      : cardMoved ? `modal card changed height ${cardBefore}px → ${cardAfter}px when the keyboard opened`
      : "";
    report.push({ scenario: scenario.name, field: label, pass, why });
    if (!pass) {
      const file = join(OUT, `${report.length}-${scenario.name.replace(/[^a-z0-9]+/gi, "_")}-${label.replace(/[^a-z0-9]+/gi, "_").slice(0, 30)}.png`);
      await p.screenshot({ path: file }).catch(() => {});
      report[report.length - 1].shot = file;
    }
    await h.evaluate(el => el.blur()).catch(() => {});
    await sleep(200);
  }
  if (n === 0) report.push({ scenario: scenario.name, field: "(no fields found)", pass: false, why: "scenario opened nothing with a text field — check its `open` steps" });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(k => { try { localStorage.setItem("rms.mockKeyboard", k); } catch {} }, KEYBOARD);
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.setDefaultNavigationTimeout(120000);
  const errors = [];
  p.on("pageerror", e => errors.push(e.message.split("\n")[0]));

  await p.goto(BASE + "/robot", { waitUntil: "load" }); await sleep(2000);
  const inp = p.getByPlaceholder("192.168.1.50");
  if (await inp.count()) { await inp.first().fill(CONTROLLER); await tap(p, "Connect"); await sleep(2500); }

  const report = [];
  for (const s of SCENARIOS) {
    if (filter && !s.name.toLowerCase().includes(filter)) continue;
    try {
      await p.goto(BASE + s.route, { waitUntil: "load" }); await sleep(1800);
      await s.open(p);
      await auditFields(p, s, report);
    } catch (e) {
      report.push({ scenario: s.name, field: "(scenario)", pass: false, why: "could not run: " + e.message.split("\n")[0] });
    }
  }
  await browser.close();

  const failed = report.filter(r => !r.pass);
  for (const r of report) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.scenario}  ·  ${r.field}${r.why ? "  —  " + r.why : ""}${r.shot ? "\n        " + r.shot : ""}`);
  console.log(`\n${report.length - failed.length}/${report.length} fields visible with the keyboard up${errors.length ? `  ·  ${errors.length} page error(s): ${errors[0]}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
