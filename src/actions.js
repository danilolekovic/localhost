import { spawn } from "node:child_process";
import { discoverServers, findServer } from "./discovery.js";

export async function resolveLiveServer(target) {
  return findServer(await discoverServers(), target);
}

export async function stopServer(target, { force = false } = {}) {
  const server = await resolveLiveServer(target);
  const signal = force ? "SIGKILL" : "SIGTERM";
  process.kill(server.pid, signal);
  return { ok: true, action: "stop", signal, pid: server.pid, port: server.port, name: server.name };
}

export async function openServer(target) {
  const server = await resolveLiveServer(target);
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", server.url] : [server.url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
  return { ok: true, action: "open", pid: server.pid, port: server.port, url: server.url };
}
