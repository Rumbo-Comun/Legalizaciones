import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const serverDir = join(root, "dist", "server");
const configPath = join(serverDir, "wrangler.json");
const defaultPersistPath =
  process.platform === "win32" ? join(root, ".wrangler", "state") : "/app/.wrangler/state";
const persistPath = process.env.WRANGLER_PERSIST_TO || defaultPersistPath;
const port = process.env.PORT || "3000";
const ip = process.env.HOSTNAME || "0.0.0.0";
const wranglerBin = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

if (!existsSync(configPath)) {
  console.error("No se encontro dist/server/wrangler.json. Ejecuta npm run build primero.");
  process.exit(1);
}

if (!existsSync(wranglerBin)) {
  console.error("No se encontro Wrangler en node_modules. Ejecuta npm install primero.");
  process.exit(1);
}

const command = process.execPath;
const args = [
  wranglerBin,
  "dev",
  "--config",
  "wrangler.json",
  "--ip",
  ip,
  "--port",
  port,
  "--local",
  "--persist-to",
  persistPath,
  "--log-level",
  "info",
];

const child = spawn(command, args, {
  cwd: serverDir,
  env: {
    ...process.env,
    WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS || "false",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
