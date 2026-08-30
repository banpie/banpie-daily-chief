import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ZipArchive } from "archiver";

const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const version = rootPackage.version;
const targetPlatform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const targetArch = process.arch;
const outputDirectory = resolve(process.env.DAILY_CHIEF_RELEASE_DIR || "release");
const temporary = mkdtempSync(join(tmpdir(), "daily-chief-runtime-"));
const stage = join(temporary, "stage");
const appDirectory = join(stage, "app");
const binDirectory = join(stage, "bin");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  return result.stdout;
}

function pack(workspace) {
  const output = run(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--json", "--pack-destination", temporary], { cwd: resolve(workspace) });
  const result = JSON.parse(output);
  if (!Array.isArray(result) || !result[0]?.filename) throw new Error(`npm pack did not return an artifact for ${workspace}`);
  return join(temporary, basename(result[0].filename));
}

async function installPortableNode(destination) {
  if (process.env.DAILY_CHIEF_NODE_BINARY) {
    copyFileSync(resolve(process.env.DAILY_CHIEF_NODE_BINARY), destination);
    return;
  }
  const nodePlatform = process.platform === "win32" ? "win" : process.platform;
  const extension = process.platform === "win32" ? "zip" : process.platform === "darwin" ? "tar.gz" : "tar.xz";
  const distribution = `node-${process.version}-${nodePlatform}-${process.arch}`;
  const archivePath = join(temporary, `${distribution}.${extension}`);
  const response = await fetch(`https://nodejs.org/dist/${process.version}/${distribution}.${extension}`);
  if (!response.ok) throw new Error(`Unable to download official Node runtime: HTTP ${response.status}`);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  const extractRoot = join(temporary, "node-distribution");
  mkdirSync(extractRoot, { recursive: true });
  if (process.platform === "win32") {
    run("powershell.exe", ["-NoProfile", "-Command", "& { param($archive, $target) Expand-Archive -LiteralPath $archive -DestinationPath $target -Force }", archivePath, extractRoot]);
  } else {
    run("tar", [process.platform === "darwin" ? "-xzf" : "-xJf", archivePath, "-C", extractRoot]);
  }
  const source = join(extractRoot, distribution, process.platform === "win32" ? "node.exe" : "bin/node");
  copyFileSync(source, destination);
}

try {
  mkdirSync(appDirectory, { recursive: true });
  mkdirSync(binDirectory, { recursive: true });
  const coreArchive = pack("packages/core");
  const cliArchive = pack("packages/cli");
  writeFileSync(join(appDirectory, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev", "--ignore-scripts=false", coreArchive, cliArchive], { cwd: appDirectory });

  const runtimeNode = join(binDirectory, process.platform === "win32" ? "node.exe" : "node");
  await installPortableNode(runtimeNode);
  if (process.platform !== "win32") chmodSync(runtimeNode, 0o755);
  writeFileSync(join(stage, "runtime.json"), `${JSON.stringify({ version, platform: targetPlatform, architecture: targetArch, node: process.version }, null, 2)}\n`);

  const cli = join(appDirectory, "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js");
  const smoke = run(runtimeNode, [cli, "--version"], { env: { ...process.env, DAILY_CHIEF_HOME: join(temporary, "smoke-data") } }).trim();
  if (!smoke.includes(version)) throw new Error(`Runtime smoke test returned unexpected version: ${smoke}`);

  mkdirSync(outputDirectory, { recursive: true });
  const destination = join(outputDirectory, `banpie-daily-chief-runtime-${targetPlatform}-${targetArch}-${version}.zip`);
  const output = createWriteStream(destination);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const closed = new Promise((resolveClosed, reject) => { output.on("close", resolveClosed); archive.on("error", reject); });
  archive.pipe(output);
  archive.directory(stage, false);
  await archive.finalize();
  await closed;

  const extracted = join(temporary, "extracted");
  mkdirSync(extracted, { recursive: true });
  if (process.platform === "win32") {
    run("powershell.exe", ["-NoProfile", "-Command", "& { param($archive, $target) Expand-Archive -LiteralPath $archive -DestinationPath $target -Force }", destination, extracted]);
  } else {
    run("unzip", ["-q", destination, "-d", extracted]);
  }
  const extractedNode = join(extracted, "bin", process.platform === "win32" ? "node.exe" : "node");
  const extractedCli = join(extracted, "app", "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js");
  const extractedSmoke = run(extractedNode, [extractedCli, "--version"], { env: { ...process.env, DAILY_CHIEF_HOME: join(temporary, "extracted-smoke-data") } }).trim();
  if (!extractedSmoke.includes(version)) throw new Error(`Extracted runtime smoke test returned unexpected version: ${extractedSmoke}`);
  process.stdout.write(`${destination}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
