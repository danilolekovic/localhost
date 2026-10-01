import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { discoverServers, findServer, parseLsofFieldOutput } from "../src/discovery.js";

test("parses lsof field output and preserves IPv4 and IPv6 listeners", () => {
  const output = [
    "p123", "cnode", "f20", "n*:3000", "f21", "n[::1]:3001",
    "p456", "cpython", "f7", "n127.0.0.1:8000",
  ].join("\n");
  assert.deepEqual(parseLsofFieldOutput(output), [
    { pid: 123, commandName: "node", address: "*:3000", port: 3000 },
    { pid: 123, commandName: "node", address: "[::1]:3001", port: 3001 },
    { pid: 456, commandName: "python", address: "127.0.0.1:8000", port: 8000 },
  ]);
});

test("finds a server by port, colon-prefixed port, or PID", () => {
  const servers = [
    { pid: 100, port: 3000, name: "web" },
    { pid: 200, port: 8000, name: "api" },
  ];
  assert.equal(findServer(servers, "3000").name, "web");
  assert.equal(findServer(servers, ":8000").name, "api");
  assert.equal(findServer(servers, "200").name, "api");
});

test("rejects invalid and missing targets", () => {
  assert.throws(() => findServer([], "nope"), { code: "INVALID_TARGET" });
  assert.throws(() => findServer([], "3000"), { code: "SERVER_NOT_FOUND" });
});

test("rejects an ambiguous numeric target", () => {
  const servers = [
    { pid: 3000, port: 9000, name: "worker" },
    { pid: 4000, port: 3000, name: "web" },
  ];
  assert.throws(() => findServer(servers, "3000"), { code: "AMBIGUOUS_TARGET" });
});

test("discovers a real local development listener", async (t) => {
  const listener = createServer();
  try {
    await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", resolve).once("error", reject));
  } catch (error) {
    if (error.code === "EPERM") {
      t.skip("sandbox does not allow binding localhost ports");
      return;
    }
    throw error;
  }
  t.after(() => listener.close());
  const port = listener.address().port;
  const servers = await discoverServers();
  const server = servers.find((candidate) => candidate.port === port && candidate.pid === process.pid);
  assert.ok(server, `expected to discover test listener on port ${port}`);
  assert.equal(server.development, true);
  assert.equal(server.name, "localhost-cockpit");
});
