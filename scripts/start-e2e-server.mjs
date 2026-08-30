import { mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const outputDirectory = resolve("output/playwright");
const databasePath = resolve(outputDirectory, "e2e.sqlite");
mkdirSync(outputDirectory, { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });

const child = spawn(process.execPath, [
  "packages/cli/dist/index.js",
  "--database", databasePath,
  "serve", "--port", "3212", "--no-open"
], {
  stdio: "inherit",
  env: { ...process.env, DAILY_CHIEF_LOCAL_TOKEN: "daily-chief-e2e-token" }
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
