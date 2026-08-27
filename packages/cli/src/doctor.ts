import { accessSync, constants, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { API_VERSION, capabilityReportSchema, type CapabilityReport, DailyChiefDatabase } from "@banpie/daily-chief-core";
import { defaultDatabasePath } from "./paths.js";

function detectHost(): string {
  if (process.env.DAILY_CHIEF_AGENT_HOST) return process.env.DAILY_CHIEF_AGENT_HOST;
  if (process.env.WORKBUDDY_HOME && !process.env.CODEX_HOME) return "WorkBuddy";
  if (process.env.CODEX_HOME && !process.env.WORKBUDDY_HOME) return "Codex";
  const workbuddyInstalled = existsSync(join(homedir(), ".workbuddy"));
  const codexInstalled = existsSync(join(homedir(), ".codex"));
  if (workbuddyInstalled && codexInstalled) return "Codex + WorkBuddy installed (current host unknown)";
  if (workbuddyInstalled) return "WorkBuddy";
  if (codexInstalled) return "Codex";
  return "Generic Agent";
}

export function runDoctor(databasePath = defaultDatabasePath()): CapabilityReport {
  let databaseAvailable = false;
  let writable = false;
  let error: string | undefined;
  try {
    const db = new DailyChiefDatabase(databasePath);
    db.close();
    databaseAvailable = true;
    accessSync(databasePath, constants.R_OK | constants.W_OK);
    writable = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const host = detectHost();
  const adapters = [
    {
      adapter_id: "local-tasks",
      api_version: API_VERSION,
      capabilities: ["local.tasks.write" as const, "tasks.read" as const],
      host,
      operating_system: platform(),
      provider: "Banpie Daily Chief",
      available: databaseAvailable,
      needs_login: false,
      read_only: false,
      ...(error ? { failure_reason: error, recovery_hint: "Check whether the local data directory is writable." } : {})
    },
    {
      adapter_id: "standard-file-import",
      api_version: API_VERSION,
      capabilities: ["calendar.read" as const, "tasks.read" as const, "mail.read" as const, "notes.read" as const, "signals.read" as const],
      host,
      operating_system: platform(),
      provider: "ICS / CSV / Markdown / JSON",
      available: true,
      needs_login: false,
      read_only: true
    }
  ];

  return capabilityReportSchema.parse({
    schema_version: API_VERSION,
    checked_at: new Date().toISOString(),
    agent_host: host,
    operating_system: platform(),
    node_version: process.version,
    scheduler_available: process.env.DAILY_CHIEF_SCHEDULER_AVAILABLE === "1",
    notification_available: process.env.DAILY_CHIEF_NOTIFICATION_AVAILABLE === "1",
    adapters,
    local_database: {
      available: databaseAvailable,
      path: databasePath,
      writable,
      ...(error ? { error } : {})
    }
  });
}
