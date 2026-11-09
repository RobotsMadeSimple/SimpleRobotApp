// ─────────────────────────────────────────────────────────────────────────────
// Choosing a controller address from mDNS
//
// A controller on a PC with several adapters (Wi-Fi, Ethernet, Tailscale, Hyper-V/WSL switches)
// publishes an address for each, and Android's resolver hands the app just one of them — often one the
// phone can't reach. The controller also lists all of them, best first, in its `Addresses` TXT record.
// We rank every candidate and probe them in parallel, then use the best-ranked one that answers.
// ─────────────────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 2500;

/** IPv4 dotted quad. IPv6 is skipped: the controller listens on IPv4 and URLs would need brackets. */
export function isIpv4(s: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  return !!m && m.slice(1).every(o => Number(o) <= 255);
}

/** 100.64.0.0/10 — carrier-grade NAT space, used by Tailscale and similar overlay networks. */
export function isCgnat(ip: string): boolean {
  if (!isIpv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && (b & 0xc0) === 64;
}

function usable(ip: string): boolean {
  return isIpv4(ip) && !ip.startsWith("127.") && !ip.startsWith("169.254.") && ip !== "0.0.0.0";
}

/**
 * Every usable candidate, best first: the controller's own TXT order (it knows which adapter is the
 * LAN), then whatever the resolver returned. Overlay (CGNAT) addresses go last either way, so a phone
 * on the same network tries the LAN address before a VPN one.
 */
export function rankAddresses(txtAddresses: string | undefined, resolved: (string | undefined)[]): string[] {
  const fromTxt = (txtAddresses ?? "").split(",").map(s => s.trim());
  const all = [...fromTxt, ...resolved.map(s => (s ?? "").trim())].filter(usable);
  const unique = [...new Set(all)];
  return [...unique.filter(ip => !isCgnat(ip)), ...unique.filter(isCgnat)];
}

/** True when anything answers HTTP at ip:port within the timeout (any status — a 404 still proves a route). */
export async function probe(ip: string, port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // no-cors: in a browser the controller's reply has no CORS headers, which would otherwise reject
    // the fetch even though the address answered (an opaque response still proves the route).
    await fetch(`http://${ip}:${port}/`, { method: "GET", mode: "no-cors", signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** A controller address with its own port (a saved robot may be known on several). */
export type Endpoint = { host: string; port: number };

/**
 * Rank remembered addresses of one robot, keeping the given order within each group: LAN IPv4
 * first, then loopback, then hostnames, then overlay (CGNAT/VPN) addresses — the same "LAN before
 * VPN" rule as rankAddresses. Duplicates, link-local and 0.0.0.0 are dropped.
 */
export function rankEndpoints(list: Endpoint[]): Endpoint[] {
  const seen = new Set<string>();
  const unique: Endpoint[] = [];
  for (const e of list) {
    const host = (e?.host ?? "").trim();
    const port = Number(e?.port) || 0;
    if (!host || !port || host === "0.0.0.0" || host.startsWith("169.254.") || host.includes(":")) continue;
    const k = `${host.toLowerCase()}:${port}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push({ host, port });
  }
  const loop = (h: string) => h.startsWith("127.") || h.toLowerCase() === "localhost";
  const lan  = unique.filter(e => isIpv4(e.host) && !isCgnat(e.host) && !loop(e.host));
  const self = unique.filter(e => loop(e.host));   // only answers when the controller is on this device
  const name = unique.filter(e => !isIpv4(e.host) && !loop(e.host));
  const vpn  = unique.filter(e => isCgnat(e.host));
  return [...lan, ...self, ...name, ...vpn];
}

/** pickReachable for endpoints that may differ in port: best-ranked one that answers, or null. */
export async function pickReachableEndpoint(
  candidates: Endpoint[],
  probeFn: (ip: string, port: number) => Promise<boolean> = probe,
): Promise<Endpoint | null> {
  if (candidates.length === 0) return null;
  const results = candidates.map(c => probeFn(c.host, c.port).catch(() => false));
  for (let i = 0; i < candidates.length; i++) {
    if (await results[i]) return candidates[i];
  }
  return null;
}

/**
 * Probe every candidate at once and return the best-ranked one that answers (or null). A lower-ranked
 * success only wins once every better-ranked candidate has failed, so the LAN beats a VPN that happens to
 * answer first, while the total wait stays one probe timeout.
 */
export async function pickReachable(
  candidates: string[], port: number,
  probeFn: (ip: string, port: number) => Promise<boolean> = probe,
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const results = candidates.map(ip => probeFn(ip, port).catch(() => false));
  for (let i = 0; i < candidates.length; i++) {
    if (await results[i]) return candidates[i];
  }
  return null;
}
