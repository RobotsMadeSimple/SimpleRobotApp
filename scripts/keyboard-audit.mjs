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
    name: "builder — Add Variable modal",
    route: "/program/builder",
    open: async p => { await tap(p, "Add Variable"); await sleep(800); },
  },
  {
    name: "builder — program name + description (page)",
    route: "/program/builder",
    open: async () => {},
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
    const pass = result.focused && result.keyboardUp && result.aboveKeyboard && result.inViewport && !result.covered;
    const why = !result.focused ? "field did not take focus"
      : !result.keyboardUp ? "mock keyboard did not appear (is it enabled?)"
      : !result.aboveKeyboard ? `field bottom ${result.bottom}px is below keyboard top ${result.keyboardTop}px`
      : !result.inViewport ? `field (${result.top}–${result.bottom}px) is off-screen`
      : result.covered ? `field is covered by ${result.coveredBy}`
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
