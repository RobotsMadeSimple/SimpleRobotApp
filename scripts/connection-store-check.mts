// Check of src/services/connectionStore.ts (recent/saved robots keyed by serial, all their addresses).
//   npx tsx scripts/connection-store-check.mts
// AsyncStorage's web build reads window.localStorage, so give it an in-memory one before loading.
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

// Older build: one saved/recent entry per address, one of them never connected (no serial).
const robot = (ip: string, serial: string, port = 9000, name = "Virtual") =>
  ({ robotName: name, robotType: "ASTRO", ipAddress: ip, port, serialNumber: serial, controlEndpoint: "control" });
mem.set("recentConnections", JSON.stringify([
  robot("192.168.4.83", "SER1"), robot("100.103.123.116", "SER1"), robot("host.example.ts.net", ""),
  robot("192.168.4.52", "SER2", 9000, "Other"),
]));
mem.set("savedConnections", JSON.stringify([robot("100.103.123.116", "SER1")]));

const store = await import("../src/services/connectionStore.ts");

let fails = 0;
const ok = (cond: boolean, what: string) => { console.log((cond ? "PASS " : "FAIL ") + what); if (!cond) fails++; };
const ips = (r: Parameters<typeof store.addressesOf>[0]) => store.addressesOf(r).map(a => `${a.ip}:${a.port}`).sort();

await store.knownAddresses("x"); // loads + migrates
let recents = store.getRecents(), saved = store.getSaved();
ok(recents.length === 3, `migration collapses per-address recents by serial (got ${recents.length})`);
ok(JSON.stringify(ips(recents[0])) === JSON.stringify(["100.103.123.116:9000", "192.168.4.83:9000"]), "merged entry keeps both addresses");
ok(saved.length === 1 && store.isSaved(robot("192.168.4.83", "SER1")), "starred on one address = starred on the other");
ok(store.isSaved(robot("10.0.0.9", "SER1")), "starred on a never-seen address of the same robot");
ok(!store.isSaved(robot("192.168.4.52", "SER2")), "a different robot is not starred");
ok(!store.isSaved(robot("100.103.123.116", "OTHER")), "same address, different serial: not starred");

// The serial-less entry learns its id on connect and merges into the robot.
await store.enrichByAddress("host.example.ts.net", 9000, { robotName: "Virtual", serialNumber: "SER1" });
recents = store.getRecents();
ok(recents.length === 2, `entry with a learned id merges (got ${recents.length})`);
ok(ips(recents.find(r => r.serialNumber === "SER1")!).length === 3, "merged robot has all three addresses");

// Discovery sees it on a new address: learned on both lists, address in use unchanged.
ok(store.getSaved()[0].ipAddress === "host.example.ts.net", "saved entry learns the address it was connected on");
await store.learnAddress("SER1", "127.0.0.1", 9131);
saved = store.getSaved();
ok(ips(saved[0]).includes("127.0.0.1:9131"), "saved entry learns a discovered address");
ok(saved[0].ipAddress === "host.example.ts.net", "learning doesn't change the address in use");

// Endpoints to try: LAN first, overlay last.
const eps = await store.knownEndpoints(robot("100.103.123.116", "SER1"));
ok(eps[eps.length - 1].host === "100.103.123.116" && eps[0].host === "192.168.4.83", `endpoints ranked LAN first (got ${eps.map(e => e.host).join(",")})`);

// An address that now answers as another robot is dropped from this one.
await store.enrichByAddress("192.168.4.83", 9000, { serialNumber: "SER9" });
ok(!ips(store.getSaved()[0]).includes("192.168.4.83:9000"), "address taken by another robot is forgotten");

// Unstar from any address removes the robot; star again keeps every recent address.
await store.toggleSaved(robot("127.0.0.1", "SER1", 9131));
ok(store.getSaved().length === 0, "unstar from another address");
await store.toggleSaved(robot("127.0.0.1", "SER1", 9131));
ok(ips(store.getSaved()[0]).length >= 3, "star collects the robot's known addresses");

// Connected by a bare address (typed IP / host-only tag) that turns out to be this robot.
await store.enrichByAddress("10.2.2.2", 9000, { serialNumber: "SER1" });
ok(store.getSaved()[0].ipAddress === "10.2.2.2" && ips(store.getSaved()[0]).includes("10.2.2.2:9000"),
  "saved entry learns an address it was connected on by id");

// Recent connect on another address: still one row, now using that address.
await store.recordConnection(robot("10.1.1.1", "SER1"));
recents = store.getRecents();
ok(recents.filter(r => r.serialNumber === "SER1").length === 1 && recents[0].ipAddress === "10.1.1.1", "one recent row per robot, latest address in use");
ok(JSON.parse(mem.get("savedConnections")!)[0].addresses.length >= 4, "persisted with its addresses");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
