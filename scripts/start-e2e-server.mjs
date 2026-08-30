import { mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { API_VERSION, DailyChiefDatabase, sourceSnapshotSchema } from "../packages/core/dist/index.js";

const outputDirectory = resolve("output/playwright");
const databasePath = resolve(outputDirectory, "e2e.sqlite");
mkdirSync(outputDirectory, { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });

const fixtureDatabase = new DailyChiefDatabase(databasePath);
const capturedAt = new Date().toISOString();
for (const source of [
  {
    snapshot_id: "e2e-gmail-login-expired",
    source_id: "gmail",
    capability: "mail.read",
    status: "login_required",
    failure_reason: "Login expired",
    recovery_hint: "Reconnect Gmail in the current agent."
  },
  {
    snapshot_id: "e2e-outlook-timeout",
    source_id: "outlook",
    capability: "mail.read",
    status: "read_failed",
    failure_reason: "Read timed out",
    recovery_hint: "Retry Outlook from the current agent."
  }
]) {
  fixtureDatabase.saveSnapshot(sourceSnapshotSchema.parse({
    schema_version: API_VERSION,
    captured_at: capturedAt,
    timezone: "Asia/Shanghai",
    items: [],
    ...source
  }));
}
fixtureDatabase.close();

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
