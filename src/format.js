const color = {
  dim: (value) => `\u001b[2m${value}\u001b[22m`,
  cyan: (value) => `\u001b[36m${value}\u001b[39m`,
  green: (value) => `\u001b[32m${value}\u001b[39m`,
  bold: (value) => `\u001b[1m${value}\u001b[22m`,
};

function plainLength(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, "").length;
}

function pad(value, width) {
  return `${value}${" ".repeat(Math.max(0, width - plainLength(value)))}`;
}

export function formatTable(servers) {
  if (servers.length === 0) return "No listening TCP servers found.";
  const rows = servers.map((server) => [
    server.name,
    server.url,
    server.framework ?? server.process,
    String(server.pid),
    server.gitBranch ?? "—",
  ]);
  const headers = ["NAME", "URL", "STACK", "PID", "BRANCH"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => plainLength(row[index])))
  );
  const header = headers.map((cell, index) => pad(color.dim(cell), widths[index])).join("  ");
  const body = rows.map((row) => row.map((cell, index) => {
    const styled = index === 0 ? color.bold(cell) : index === 1 ? color.cyan(cell) : index === 3 ? color.green(cell) : cell;
    return pad(styled, widths[index]);
  }).join("  "));
  return [header, ...body].join("\n");
}

export function formatDetails(server) {
  const entries = [
    ["Name", server.name], ["URL", server.url], ["PID", server.pid],
    ["Process", server.process], ["Framework", server.framework],
    ["Branch", server.gitBranch], ["Directory", server.cwd],
    ["Command", server.command], ["Address", server.address],
  ].filter(([, value]) => value !== null && value !== "");
  const width = Math.max(...entries.map(([key]) => key.length));
  return entries.map(([key, value]) => `${color.dim(pad(key, width))}  ${value}`).join("\n");
}
