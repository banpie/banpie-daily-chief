import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const VERSION = "1.0.0";
const args = process.argv.slice(2);
const localCommand = process.platform === "win32" ? "daily-chief.cmd" : "daily-chief";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const root = process.env.DAILY_CHIEF_RUNTIME_ROOT
  ? resolve(process.env.DAILY_CHIEF_RUNTIME_ROOT)
  : process.env.CODEBUDDY_PLUGIN_DATA
    ? resolve(process.env.CODEBUDDY_PLUGIN_DATA)
  : platform() === "win32"
    ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "BanpieDailyChief")
    : platform() === "darwin"
      ? join(homedir(), "Library", "Application Support", "BanpieDailyChief")
      : join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "banpie-daily-chief");
function runtimePaths(version) {
  const runtime = join(root, "runtime", version);
  return {
    node: join(runtime, "bin", process.platform === "win32" ? "node.exe" : "node"),
    cli: join(runtime, "app", "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js")
  };
}

function selectedRuntime() {
  const exact = runtimePaths(VERSION);
  if (existsSync(exact.node) && existsSync(exact.cli)) return exact;
  try {
    const pointer = JSON.parse(readFileSync(join(root, "runtime", "current.json"), "utf8"));
    if (typeof pointer.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pointer.version)) return undefined;
    const previous = runtimePaths(pointer.version);
    return existsSync(previous.node) && existsSync(previous.cli) ? previous : undefined;
  } catch {
    return undefined;
  }
}

function run(command, commandArgs, fallback) {
  const child = spawn(command, commandArgs, { stdio: "inherit", windowsHide: true });
  child.once("error", (error) => {
    if (error.code === "ENOENT" && fallback) return fallback();
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => { if (code !== null) process.exitCode = code; });
}

const runtime = selectedRuntime();
if (runtime) run(runtime.node, [runtime.cli, ...args]);
else run(localCommand, args, () => run(npxCommand, ["--yes", `@banpie/daily-chief-cli@${VERSION}`, ...args]));
