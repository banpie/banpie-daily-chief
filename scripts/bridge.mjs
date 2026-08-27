import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const localCommand = process.platform === "win32" ? "daily-chief.cmd" : "daily-chief";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const root = process.env.DAILY_CHIEF_RUNTIME_ROOT
  ? resolve(process.env.DAILY_CHIEF_RUNTIME_ROOT)
  : platform() === "win32"
    ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "BanpieDailyChief")
    : platform() === "darwin"
      ? join(homedir(), "Library", "Application Support", "BanpieDailyChief")
      : join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "banpie-daily-chief");
const sourceCli = join(root, "runtime", "0.3.0-beta.1", "packages", "cli", "dist", "index.js");

function run(command, commandArgs, fallback) {
  const child = spawn(command, commandArgs, { stdio: "inherit", windowsHide: true });
  child.once("error", (error) => {
    if (error.code === "ENOENT" && fallback) return fallback();
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => { if (code !== null) process.exitCode = code; });
}

run(localCommand, args, () => {
  if (existsSync(sourceCli)) return run(process.execPath, [sourceCli, ...args]);
  return run(npxCommand, ["--yes", "@banpie/daily-chief-cli@0.3.0-beta.1", ...args]);
});
