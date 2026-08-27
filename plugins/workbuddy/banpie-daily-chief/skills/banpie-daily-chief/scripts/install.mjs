#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const VERSION = "0.3.0-beta.1";
const TAG = `v${VERSION}`;
const ARCHIVE_URL = `https://github.com/banpie/banpie-daily-chief/archive/refs/tags/${TAG}.zip`;

function dataRoot() {
  if (process.env.DAILY_CHIEF_RUNTIME_ROOT) return resolve(process.env.DAILY_CHIEF_RUNTIME_ROOT);
  if (platform() === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "BanpieDailyChief");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "BanpieDailyChief");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "banpie-daily-chief");
}

const runtime = join(dataRoot(), "runtime", VERSION);
const cli = join(runtime, "packages", "cli", "dist", "index.js");
const argumentsSet = new Set(process.argv.slice(2));

if (argumentsSet.has("--print-path")) {
  process.stdout.write(`${cli}\n`);
  process.exit(0);
}

if (argumentsSet.has("--uninstall")) {
  if (existsSync(runtime)) rmSync(runtime, { recursive: true, force: true });
  process.stdout.write(`已移除运行时 ${VERSION}；本地任务数据库仍保留在 ${dataRoot()}。\n`);
  process.exit(0);
}

if (existsSync(cli)) {
  process.stdout.write(`半撇每日参谋 ${VERSION} 已安装：${cli}\n`);
  process.exit(0);
}

if (Number(process.versions.node.split(".")[0]) < 20) {
  throw new Error(`需要 Node.js 20 或更高版本；当前为 ${process.version}。`);
}

const temporary = mkdtempSync(join(tmpdir(), "daily-chief-install-"));
const archive = join(temporary, `${TAG}.zip`);
const extracted = join(temporary, `banpie-daily-chief-${VERSION}`);

try {
  const response = await fetch(ARCHIVE_URL);
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

  const extraction = platform() === "win32"
    ? spawnSync("powershell.exe", ["-NoProfile", "-Command", "& { param($archive, $target) Expand-Archive -LiteralPath $archive -DestinationPath $target -Force }", archive, temporary], { stdio: "inherit", windowsHide: true })
    : spawnSync("unzip", ["-q", archive, "-d", temporary], { stdio: "inherit" });
  if (extraction.status !== 0) throw new Error("无法解压安装包。请确认系统自带的解压工具可用。");

  mkdirSync(dirname(runtime), { recursive: true });
  if (existsSync(runtime)) rmSync(runtime, { recursive: true, force: true });
  renameSync(extracted, runtime);

  const npm = platform() === "win32" ? "npm.cmd" : "npm";
  const install = spawnSync(npm, ["ci", "--ignore-scripts=false"], { cwd: runtime, stdio: "inherit", windowsHide: true });
  if (install.status !== 0) throw new Error("依赖安装失败；运行时目录已保留，便于 Agent 查看 npm 错误。");
  const build = spawnSync(npm, ["run", "build"], { cwd: runtime, stdio: "inherit", windowsHide: true });
  if (build.status !== 0 || !existsSync(cli)) throw new Error("构建失败，未找到可运行的 CLI。");

  process.stdout.write(`半撇每日参谋 ${VERSION} 已安装：${cli}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
