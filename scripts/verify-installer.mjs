import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const version = rootPackage.version;
const target = `${process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux"}-${process.arch}`;
const artifactName = `banpie-daily-chief-runtime-${target}-${version}.zip`;
const artifactPath = resolve("release", artifactName);
if (!existsSync(artifactPath)) throw new Error(`Missing runtime artifact: ${artifactPath}`);
const checksum = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "daily-chief-installer-verification-"));
const runtimeRoot = join(temporary, "runtime-root");
const databasePath = join(temporary, "user-data", "daily-chief.sqlite");

function run(command, args, environment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("exit", (code) => code === 0 ? resolveRun(stdout) : rejectRun(new Error(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`)));
  });
}

const server = createServer((request, response) => {
  if (request.url === `/${artifactName}`) {
    response.setHeader("Content-Type", "application/zip");
    response.end(readFileSync(artifactPath));
    return;
  }
  if (request.url === "/SHA256SUMS") {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(`${checksum}  ${artifactName}\n`);
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to resolve verification server port");
  const environment = {
    ...process.env,
    DAILY_CHIEF_RUNTIME_ROOT: runtimeRoot,
    DAILY_CHIEF_RELEASE_ROOT: `http://127.0.0.1:${address.port}`
  };
  const installer = resolve("skills/banpie-daily-chief/scripts/install.mjs");
  await run(process.execPath, [installer], environment);

  const installed = join(runtimeRoot, "runtime", version);
  const runtimeNode = join(installed, "bin", process.platform === "win32" ? "node.exe" : "node");
  const runtimeCli = join(installed, "app", "node_modules", "@banpie", "daily-chief-cli", "dist", "index.js");
  if (!existsSync(runtimeNode) || !existsSync(runtimeCli)) throw new Error("Installed runtime is incomplete");
  const pointer = join(runtimeRoot, "runtime", "current.json");
  writeFileSync(pointer, `${JSON.stringify({ version: "previous-version" })}\n`);
  await run(process.execPath, [installer], environment);
  if (JSON.parse(readFileSync(pointer, "utf8")).version !== version) throw new Error("Reinstall did not atomically refresh current.json");
  await run(runtimeNode, [runtimeCli, "--database", databasePath, "seed-demo"], environment);
  if (!existsSync(databasePath)) throw new Error("Verification task database was not created");

  await run(process.execPath, [installer, "--uninstall"], environment);
  if (existsSync(installed)) throw new Error("Uninstall did not remove the versioned runtime");
  if (!existsSync(databasePath)) throw new Error("Uninstall removed the user task database");
  const remainingRuntimeEntries = existsSync(join(runtimeRoot, "runtime")) ? readdirSync(join(runtimeRoot, "runtime")) : [];
  process.stdout.write(`Installer verified for ${basename(artifactPath)}; database preserved; remaining runtime entries: ${remainingRuntimeEntries.join(", ") || "none"}.\n`);
} finally {
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  rmSync(temporary, { recursive: true, force: true });
}
