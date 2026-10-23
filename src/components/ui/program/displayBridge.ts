import { useCallback, useEffect, useRef } from "react";

import { imageDataUri } from "@/src/models/robotModels";
import { useProgramSummaries } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * Host side of a custom program display page.
 *
 * A display page is user-authored HTML rendered in a sandboxed WebView/iframe (see
 * DisplayPageView). The page never talks to the controller directly — it calls a small
 * `window.robot` API (injected by {@link BRIDGE_JS}) which postMessages to this host, and
 * the host brokers every request over the app's already-open connection. That keeps one
 * data path (the same polls/streams the monitor uses) and lets the identical page run on
 * web, Android and Electron.
 *
 * Message envelope (both directions), JSON strings tagged `__rb:1`:
 *  • page → host request:   { __rb, id, method, args }      → host replies { __rb, id, result, error? }
 *  • page → host "ready":   { __rb, event:"ready" }         (host pushes a fresh snapshot back)
 *  • host → page events:    { __rb, event:"vars"|"state"|"history", … }
 */

export type DisplayState = {
  status: string;
  currentStep: string;
  stepNumber: number;
  maxSteps: number;
  error: string;
  warning: string;
};

/** The script injected into every display page. Defines `window.robot` and the transport. */
export const BRIDGE_JS = `
(function () {
  if (window.robot) return;
  var pending = {}, seq = 0;
  var subs = { vars: [], state: [], history: {}, expr: {} };

  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent) window.parent.postMessage(s, '*');
  }
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'c' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      send({ __rb: 1, id: id, method: method, args: args || [] });
    });
  }
  function handle(raw) {
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || m.__rb !== 1) return;
    if (m.id && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
      return;
    }
    if (m.event === 'vars') subs.vars.forEach(function (cb) { try { cb(m.values || {}, m.bools || {}); } catch (e) {} });
    else if (m.event === 'state') subs.state.forEach(function (cb) { try { cb(m.state); } catch (e) {} });
    else if (m.event === 'history') (subs.history[m.channel] || []).forEach(function (cb) { try { cb(m.samples || []); } catch (e) {} });
    else if (m.event === 'exprs') {
      var vals = m.values || {};
      Object.keys(vals).forEach(function (ex) {
        (subs.expr[ex] || []).forEach(function (cb) { try { cb(vals[ex].v, vals[ex].b); } catch (e) {} });
      });
    }
  }
  // react-native-webview delivers on window (Android historically on document) — listen to both.
  window.addEventListener('message', function (e) { handle(typeof e.data === 'string' ? e.data : ''); });
  document.addEventListener('message', function (e) { handle(typeof e.data === 'string' ? e.data : ''); });

  function unsub(list, cb) { return function () { var i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); }; }

  window.robot = {
    /** Latest known value of a variable (number, or boolean for boolean variables). */
    getVar: function (name) { return call('getVar', [name]); },
    /** Current program run state: { status, currentStep, stepNumber, maxSteps, error, warning }. */
    getState: function () { return call('getState', []); },
    /** A display-image variable as a data: URI, or null if nothing has been captured. */
    getImage: function (name) { return call('getImage', [name]); },
    /** Start this program, optionally seeding its input variables: robot.run({ speed: 120 }). */
    run: function (vars) { return call('run', [vars || {}]); },
    /** Stop this program. */
    stop: function () { return call('stop', []); },
    /** Subscribe to every variable tick. cb(values, bools). Returns an unsubscribe function. */
    subscribe: function (cb) { subs.vars.push(cb); return unsub(subs.vars, cb); },
    /** Subscribe to one variable by name. cb(value). Returns an unsubscribe function. */
    onVar: function (name, cb) {
      return window.robot.subscribe(function (values, bools) {
        if (name in bools) cb(bools[name]); else if (name in values) cb(values[name]);
      });
    },
    /** Subscribe to an expression evaluated live against the program. cb(value, isBoolean). */
    onExpr: function (expr, cb) {
      if (!expr) return function () {};
      if (!subs.expr[expr]) subs.expr[expr] = [];
      subs.expr[expr].push(cb);
      call('subscribeExpr', [expr]);
      return function () {
        var a = subs.expr[expr] || []; var i = a.indexOf(cb); if (i >= 0) a.splice(i, 1);
        if (a.length === 0) call('unsubscribeExpr', [expr]);
      };
    },
    /** Subscribe to program state changes. cb(state). Returns an unsubscribe function. */
    onState: function (cb) { subs.state.push(cb); return unsub(subs.state, cb); },
    /** Stream a load cell's live samples. cb(samples) with [{ t, v, r }]. Returns unsubscribe. */
    onHistory: function (deviceId, pin, cb) {
      var ch = deviceId + '/' + pin;
      if (!subs.history[ch]) subs.history[ch] = [];
      subs.history[ch].push(cb);
      call('subscribeHistory', [deviceId, pin]);
      return function () {
        var a = subs.history[ch] || []; var i = a.indexOf(cb); if (i >= 0) a.splice(i, 1);
        if (a.length === 0) call('unsubscribeHistory', [deviceId, pin]);
      };
    },
  };
  send({ __rb: 1, event: 'ready' });
})();
`;

/** Wrap body-level user HTML in a full document with the bridge script in the head. */
export function wrapDisplayHtml(userHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`
    + `<script>${BRIDGE_JS}</script>`
    + `<style>html,body{margin:0;padding:0;font-family:-apple-system,system-ui,sans-serif;}</style>`
    + `</head><body>${userHtml || ""}</body></html>`;
}

export type UseDisplayHostOpts = {
  programName: string;
  programId?: string;
  /** Send a JSON string into the page (iframe.contentWindow.postMessage / WebView.postMessage). */
  post: (json: string) => void;
};

/**
 * Drives one display page: polls the program's variables, pushes run-state changes, answers
 * the page's requests (getVar/getState/getImage/run/stop) and opens load-cell history streams
 * on demand. Platform components (DisplayPageView[.web]) own only the transport and call
 * {@link handleIncoming} with each message the page posts.
 */
export function useDisplayHost({ programName, programId, post }: UseDisplayHostOpts) {
  // Kept in a ref so the polling/stream callbacks always reach the current transport without
  // being in their dependency arrays. Updated in an effect (never during render).
  const postRef = useRef(post);
  useEffect(() => { postRef.current = post; }, [post]);

  const summaries = useProgramSummaries();
  const summary = summaries.find((p) => p.name === programName) ?? null;

  const latestVars = useRef<{ values: Record<string, number>; bools: Record<string, boolean> }>({
    values: {},
    bools: {},
  });
  const historyStreams = useRef<Record<string, () => void>>({});
  // Expressions the page is watching → how many widgets want each (evaluated live below).
  const exprSubs = useRef<Map<string, number>>(new Map());

  const push = useCallback((obj: Record<string, unknown>) => {
    try { postRef.current(JSON.stringify({ __rb: 1, ...obj })); } catch { /* transport gone */ }
  }, []);

  // ── Variable polling (the same round-trip the monitor uses) ──────────────────
  useEffect(() => {
    if (!programName) return;
    let cancelled = false;
    const tick = () => {
      robotClient
        .getProgramVariables(programName)
        .then(({ variables }) => {
          if (cancelled || variables.length === 0) return;
          const values: Record<string, number> = {};
          const bools: Record<string, boolean> = {};
          for (const v of variables) {
            const num = typeof v.value === "number" ? v.value : Number(v.value);
            values[v.name] = num;
            if (v.isBoolean) bools[v.name] = num !== 0;
          }
          latestVars.current = { values, bools };
          push({ event: "vars", values, bools });
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 300);
    return () => { cancelled = true; clearInterval(t); };
  }, [programName, push]);

  // ── Expression bindings (value/gauge/lamp/graph) evaluated live on the controller ──
  useEffect(() => {
    if (!programName) return;
    let cancelled = false;
    const tick = async () => {
      const exprs = Array.from(exprSubs.current.keys());
      if (cancelled || exprs.length === 0) return;
      const results = await Promise.all(
        exprs.map((e) => robotClient.evaluateExpression(e, programName).catch(() => null)),
      );
      if (cancelled) return;
      const values: Record<string, { v: number | null; b: boolean }> = {};
      exprs.forEach((e, i) => {
        const r = results[i];
        values[e] = { v: r && r.ok && r.value !== undefined ? r.value : null, b: !!r?.isBoolean };
      });
      push({ event: "exprs", values });
    };
    const t = setInterval(tick, 400);
    return () => { cancelled = true; clearInterval(t); };
  }, [programName, push]);

  // ── Run state (pushed on change) ─────────────────────────────────────────────
  const state: DisplayState = {
    status: summary?.status ?? "Ready",
    currentStep: summary?.currentStepDescription ?? "",
    stepNumber: summary?.currentStepNumber ?? 0,
    maxSteps: summary?.maxStepCount ?? 0,
    error: summary?.errorDescription ?? "",
    warning: summary?.warningDescription ?? "",
  };
  const stateKey = JSON.stringify(state);
  useEffect(() => {
    push({ event: "state", state: JSON.parse(stateKey) as DisplayState });
  }, [stateKey, push]);

  // Close any open history streams when the page goes away.
  useEffect(
    () => () => {
      Object.values(historyStreams.current).forEach((close) => close());
      historyStreams.current = {};
    },
    [],
  );

  const handleIncoming = useCallback(
    (raw: string) => {
      let m: any;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || m.__rb !== 1) return;

      if (m.event === "ready") {
        // A (re)load wipes the page's own subscriptions, so drop the host-side ones it can no
        // longer unsubscribe (the fresh page re-subscribes). Prevents leaks across preview reloads.
        Object.values(historyStreams.current).forEach((close) => close());
        historyStreams.current = {};
        exprSubs.current.clear();
        // Hand the fresh page the current snapshot immediately.
        push({ event: "vars", values: latestVars.current.values, bools: latestVars.current.bools });
        push({ event: "state", state: JSON.parse(stateKey) as DisplayState });
        return;
      }

      const reply = (result: unknown, error?: string) => push({ id: m.id, result, error });

      switch (m.method) {
        case "getVar": {
          const name = m.args?.[0];
          const val = name in latestVars.current.bools
            ? latestVars.current.bools[name]
            : latestVars.current.values[name];
          reply(val ?? null);
          break;
        }
        case "getState":
          reply(JSON.parse(stateKey) as DisplayState);
          break;
        case "getImage":
          robotClient
            .getProgramVariableImage(programName, m.args?.[0])
            .then((b64) => reply(b64 ? imageDataUri(b64) : null))
            .catch((e) => reply(null, String(e)));
          break;
        case "run":
          robotClient
            .startProgram(programName, programId, m.args?.[0] || {})
            .then(() => reply(true))
            .catch((e) => reply(false, String(e)));
          break;
        case "stop":
          robotClient
            .stopProgram(programName)
            .then(() => reply(true))
            .catch((e) => reply(false, String(e)));
          break;
        case "subscribeHistory": {
          const deviceId = m.args?.[0];
          const pin = Number(m.args?.[1]);
          const ch = robotClient.ioChannelForLoadCell(deviceId, pin);
          if (!historyStreams.current[ch]) {
            historyStreams.current[ch] = robotClient.openIoHistoryStream(ch, 30_000, (samples) =>
              push({ event: "history", channel: `${deviceId}/${pin}`, samples }),
            );
          }
          reply(true);
          break;
        }
        case "unsubscribeHistory": {
          const deviceId = m.args?.[0];
          const pin = Number(m.args?.[1]);
          const ch = robotClient.ioChannelForLoadCell(deviceId, pin);
          historyStreams.current[ch]?.();
          delete historyStreams.current[ch];
          reply(true);
          break;
        }
        case "subscribeExpr": {
          const expr = String(m.args?.[0] ?? "");
          if (expr) exprSubs.current.set(expr, (exprSubs.current.get(expr) ?? 0) + 1);
          reply(true);
          break;
        }
        case "unsubscribeExpr": {
          const expr = String(m.args?.[0] ?? "");
          const n = (exprSubs.current.get(expr) ?? 0) - 1;
          if (n <= 0) exprSubs.current.delete(expr);
          else exprSubs.current.set(expr, n);
          reply(true);
          break;
        }
        default:
          reply(null, `unknown method: ${m.method}`);
      }
    },
    [programName, programId, push, stateKey],
  );

  return { handleIncoming };
}
