#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform, arch, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const VERSION = "1.0.2";
const TAG = `v${VERSION}`;
const RELEASE_ROOT = process.env.DAILY_CHIEF_RELEASE_ROOT || `https://github.com/banpie/banpie-daily-chief/releases/download/${TAG}`;

function dataRoot() {
  if (process.env.DAILY_CHIEF_RUNTIME_ROOT) return resolve(process.env.DAILY_CHIEF_RUNTIME_ROOT);
  if (process.env.CODEBUDDY_PLUGIN_DATA) return resolve(process.env.CODEBUDDY_PLUGIN_DATA);
  if (platform() === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "BanpieDailyChief");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "BanpieDailyChief");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "banpie-daily-chief");
}

function artifactTarget() {
  const operatingSystem = platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux";
  if (!(["x64", "arm64"].includes(arch()))) throw new Error(`当前架构 ${arch()} 尚无预构建运行时。`);
  if (operatingSystem === "windows" && arch() !== "x64") throw new Error("首版 Windows 运行时仅支持 x64。");
  return `${operatingSystem}-${arch()}`;
}

const root = dataRoot();
const runtime = join(root, "runtime", VERSION);
const runtimeNode = join(runtime, "bin", platform() === "win32" ? "node.exe" : "node");
const cli = join(runtime, "app", "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js");
const argumentsSet = new Set(process.argv.slice(2));

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function renameWithRetry(source, destination) {
  const retryable = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);
  const attempts = platform() === "win32" ? 15 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      renameSync(source, destination);
      return;
    } catch (error) {
      if (!retryable.has(error?.code) || attempt === attempts - 1) throw error;
      pause(Math.min(50 * 2 ** attempt, 1_000));
    }
  }
}

function updateCurrentPointer() {
  const pointer = join(root, "runtime", "current.json");
  const pointerDraft = `${pointer}.${randomUUID()}.tmp`;
  const pointerBackup = `${pointer}.${randomUUID()}.backup`;
  writeFileSync(pointerDraft, `${JSON.stringify({ version: VERSION, installed_at: new Date().toISOString() }, null, 2)}\n`);
  let pointerMoved = false;
  try {
    if (existsSync(pointer)) {
      renameWithRetry(pointer, pointerBackup);
      pointerMoved = true;
    }
    renameWithRetry(pointerDraft, pointer);
    if (pointerMoved && existsSync(pointerBackup)) rmSync(pointerBackup, { force: true });
  } catch (error) {
    if (!existsSync(pointer) && pointerMoved && existsSync(pointerBackup)) renameWithRetry(pointerBackup, pointer);
    throw error;
  } finally {
    if (existsSync(pointerDraft)) rmSync(pointerDraft, { force: true });
  }
}

if (argumentsSet.has("--print-path")) {
  process.stdout.write(`${cli}\n`);
  process.exit(0);
}

if (argumentsSet.has("--uninstall")) {
  if (existsSync(runtime)) rmSync(runtime, { recursive: true, force: true });
  const pointer = join(root, "runtime", "current.json");
  if (existsSync(pointer)) {
    try {
      const current = JSON.parse(readFileSync(pointer, "utf8"));
      if (current.version === VERSION) unlinkSync(pointer);
    } catch {
      // Keep an unreadable pointer for manual inspection instead of deleting unknown state.
    }
  }
  process.stdout.write(`已移除运行时 ${VERSION}；本地任务数据库仍保留在 ${root}。\n`);
  process.exit(0);
}

if (existsSync(runtimeNode) && existsSync(cli)) {
  updateCurrentPointer();
  process.stdout.write(`半撇每日参谋 ${VERSION} 已安装：${cli}\n`);
  process.exit(0);
}

const target = artifactTarget();
const artifact = `banpie-daily-chief-runtime-${target}-${VERSION}.zip`;
const temporary = mkdtempSync(join(tmpdir(), "daily-chief-install-"));
const archive = join(temporary, artifact);
const candidate = join(root, "runtime", `.install-${VERSION}-${randomUUID()}`);
const backup = join(root, "runtime", `.backup-${VERSION}-${Date.now()}`);
let previousMoved = false;

try {
  mkdirSync(dirname(candidate), { recursive: true });
  mkdirSync(candidate, { recursive: true });
  const [archiveResponse, checksumResponse] = await Promise.all([fetch(`${RELEASE_ROOT}/${artifact}`), fetch(`${RELEASE_ROOT}/SHA256SUMS`)]);
  if (!archiveResponse.ok) throw new Error(`运行时下载失败：HTTP ${archiveResponse.status}`);
  if (!checksumResponse.ok) throw new Error(`校验和下载失败：HTTP ${checksumResponse.status}`);
  const archiveBytes = Buffer.from(await archiveResponse.arrayBuffer());
  writeFileSync(archive, archiveBytes);
  const checksumLine = (await checksumResponse.text()).split(/\r?\n/).find((line) => line.trim().endsWith(`  ${artifact}`));
  if (!checksumLine) throw new Error("发布清单中没有当前平台制品的校验和。");
  const expected = checksumLine.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(archiveBytes).digest("hex");
  if (expected !== actual) throw new Error(`SHA-256 校验失败：期望 ${expected}，实际 ${actual}`);

  let extraction;
  if (platform() === "win32") {
    // Windows ships bsdtar, which is much faster than Expand-Archive for a
    // runtime containing thousands of small files. Retain PowerShell as a
    // compatibility fallback for older or customized systems.
    extraction = spawnSync("tar.exe", ["-xf", archive, "-C", candidate], { stdio: "inherit", windowsHide: true });
    if (extraction.status !== 0) {
      rmSync(candidate, { recursive: true, force: true });
      mkdirSync(candidate, { recursive: true });
      extraction = spawnSync("powershell.exe", ["-NoProfile", "-Command", "& { param($archive, $target) Expand-Archive -LiteralPath $archive -DestinationPath $target -Force }", archive, candidate], { stdio: "inherit", windowsHide: true });
    }
  } else {
    extraction = spawnSync("unzip", ["-q", archive, "-d", candidate], { stdio: "inherit" });
  }
  if (extraction.status !== 0) throw new Error("无法解压预构建运行时。");

  const candidateNode = join(candidate, "bin", platform() === "win32" ? "node.exe" : "node");
  const candidateCli = join(candidate, "app", "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js");
  if (!existsSync(candidateNode) || !existsSync(candidateCli)) throw new Error("运行时结构不完整。");
  if (platform() !== "win32") chmodSync(candidateNode, 0o755);
  const smoke = spawnSync(candidateNode, [candidateCli, "--version"], { encoding: "utf8", windowsHide: true });
  if (smoke.status !== 0 || !smoke.stdout.includes(VERSION)) throw new Error(`运行时自检失败：${smoke.stderr || smoke.stdout}`);

  if (existsSync(runtime)) { renameWithRetry(runtime, backup); previousMoved = true; }
  renameWithRetry(candidate, runtime);
  updateCurrentPointer();
  if (previousMoved && existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  process.stdout.write(`半撇每日参谋 ${VERSION} 已安装并通过校验：${cli}\n`);
} catch (error) {
  if (previousMoved && !existsSync(runtime) && existsSync(backup)) renameWithRetry(backup, runtime);
  throw error;
} finally {
  if (existsSync(candidate)) rmSync(candidate, { recursive: true, force: true });
  rmSync(temporary, { recursive: true, force: true });
}
