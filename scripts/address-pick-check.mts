// Check of src/services/addressPick.ts (choosing a reachable controller address from mDNS).
//   npx tsx scripts/address-pick-check.mts
import { isCgnat, pickReachable, probe, rankAddresses } from "../src/services/addressPick.ts";
import { createServer } from "node:http";

let fails = 0;
const ok = (cond: boolean, what: string) => { console.log((cond ? "PASS " : "FAIL ") + what); if (!cond) fails++; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

ok(isCgnat("100.103.123.116") && !isCgnat("100.128.0.1") && !isCgnat("192.168.4.83"), "CGNAT (Tailscale) range");

// The live case: resolver handed out the Tailscale address; TXT lists the LAN one first.
ok(eq(rankAddresses("192.168.4.83,172.25.48.1,100.103.123.116", ["100.103.123.116"]),
  ["192.168.4.83", "172.25.48.1", "100.103.123.116"]), "TXT order kept, duplicates dropped");
// An old controller without the TXT record: history and resolver, overlay last.
ok(eq(rankAddresses(undefined, ["100.103.123.116", "192.168.4.83", "100.103.123.116"]),
  ["192.168.4.83", "100.103.123.116"]), "overlay ranked after LAN without TXT");
ok(eq(rankAddresses("fe80::1,127.0.0.1,169.254.3.4,0.0.0.0", ["myhost.local", undefined, "10.0.0.5"]),
  ["10.0.0.5"]), "IPv6, loopback, link-local and hostnames dropped");

// Preference beats speed: the LAN wins even when the overlay answers first.
const delays: Record<string, [number, boolean]> = { lan: [80, true], vpn: [5, true] };
const fake = (ip: string) => new Promise<boolean>(r => setTimeout(() => r(delays[ip][1]), delays[ip][0]));
ok(await pickReachable(["lan", "vpn"], 9000, fake) === "lan", "best-ranked reachable wins over a faster one");
delays.lan = [20, false];
ok(await pickReachable(["lan", "vpn"], 9000, fake) === "vpn", "falls back when the best one fails");
delays.vpn = [20, false];
ok(await pickReachable(["lan", "vpn"], 9000, fake) === null, "null when nothing answers");
ok(await pickReachable([], 9000, fake) === null, "null with no candidates");

// Real probe: a 404 still counts as reachable; a closed port does not.
const srv = createServer((_q, res) => { res.statusCode = 404; res.end(); });
await new Promise<void>(r => srv.listen(0, "127.0.0.1", r));
const port = (srv.address() as { port: number }).port;
ok(await probe("127.0.0.1", port, 1000), "probe: HTTP 404 counts as reachable");
srv.close();
ok(!(await probe("127.0.0.1", port, 1000)), "probe: closed port is unreachable");
const t0 = Date.now();
ok(!(await probe("10.255.255.1", 9000, 300)) && Date.now() - t0 < 1500, "probe: unroutable address times out");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
