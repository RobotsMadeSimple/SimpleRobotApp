// Screenshots a program's display page at every size we support, for design review against
// docs/display-design.md. View only: it connects the web app to a controller and opens the page.
//   node scripts/display-shots.cjs "<program name>" [--out <dir>] [--only <size>] [--base http://localhost:8081] [--host localhost]
// Needs the web app served (Metro, e.g. `npx expo start --web`) and a controller to connect to.
// Sizes: desktop, tablet, phone, fold-portrait and fold-wide (Galaxy Z Fold inner screen,
// 2448x1848 at density 360 → 821x1088 / 1088x821 CSS px). Writes <out>/<size>.png, full height.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SIZES = [
  ["desktop", 1400, 1000],
  ["tablet", 900, 1200],
  ["phone", 412, 915],
  ["fold-portrait", 821, 1088],
  ["fold-wide", 1088, 821],
];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const NAME = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!NAME) { console.error('usage: node scripts/display-shots.cjs "<program name>" [--out dir] [--only size]'); process.exit(2); }
const OUT = path.resolve(opt("out", "display-shots"));
const ONLY = opt("only", "");
const BASE = opt("base", "http://localhost:8081");
const HOST = opt("host", "localhost");

async function connect(page) {
  await page.goto(BASE + "/robot", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(3000);
  const input = page.getByPlaceholder("192.168.1.50");
  if (!(await input.count())) return;
  await input.first().click();
  await input.first().pressSequentially(HOST, { delay: 30 });
  await page.waitForTimeout(400);
  const btns = page.getByText("Connect", { exact: true });
  for (let i = 0; i < (await btns.count()); i++) {
    const b = btns.nth(i);
    if ((await b.isEnabled().catch(() => false)) && (await b.isVisible())) { await b.click(); break; }
  }
  await page.waitForTimeout(4000);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // Playwright's own Chromium when installed (`npx playwright install chromium`), else Edge/Chrome.
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
  const errors = [];
  for (const [label, W, H] of SIZES) {
    if (ONLY && ONLY !== label) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H } });
      const page = await ctx.newPage();
      // The discovery bridge (localhost:3001) only runs under Electron; its refusal is expected.
      page.on("console", (m) => { if (m.type() === "error" && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(`[${label}] ${m.text().slice(0, 300)}`); });
      page.on("pageerror", (e) => errors.push(`[${label}] ${e.message.slice(0, 300)}`));
      await connect(page);
      await page.goto(`${BASE}/program/display-page?name=${encodeURIComponent(NAME)}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(7000);   // live values, camera frames and plugin pages fill in
      if (/Not Connected/i.test(await page.evaluate(() => document.body.innerText)) && attempt < 2) { await ctx.close(); continue; }
      // The page scrolls inside its own frame: grow the window until all of it shows.
      let grow = 0;
      for (const f of page.frames()) {
        if (f === page.mainFrame() || !f.url().startsWith("about:srcdoc")) continue;
        const m = await f.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
        if (m.sh > m.ch + 2) grow = Math.max(grow, m.sh - m.ch);
      }
      if (grow) { await page.setViewportSize({ width: W, height: H + grow + 20 }); await page.waitForTimeout(3000); }
      const file = path.join(OUT, `${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${label} (${W}x${H}) → ${file}`);
      await ctx.close();
      break;
    }
  }
  await browser.close();
  if (errors.length) console.log("console errors:\n" + errors.join("\n"));
})();
