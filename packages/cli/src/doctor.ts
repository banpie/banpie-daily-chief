import { accessSync, constants, readFileSync } from "node:fs";
import { platform } from "node:os";
import { API_VERSION, capabilityReportSchema, type CapabilityReport, DailyChiefDatabase } from "@banpie/daily-chief-core";
import { defaultDatabasePath } from "./paths.js";

export function runDoctor(databasePath = defaultDatabasePath(), hostReportPath?: string): CapabilityReport {
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

  const supplied = hostReportPath
    ? capabilityReportSchema.parse(JSON.parse(readFileSync(hostReportPath, "utf8")))
    : undefined;
  const host = supplied?.agent_host ?? "Current host unknown";
  const localAdapters = [
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

  const suppliedAdapters = supplied?.adapters.filter((adapter) => !["local-tasks", "standard-file-import"].includes(adapter.adapter_id)) ?? [];
  return capabilityReportSchema.parse({
    schema_version: API_VERSION,
    checked_at: new Date().toISOString(),
    agent_host: host,
    operating_system: platform(),
    node_version: process.version,
    scheduler_available: supplied?.scheduler_available ?? false,
    notification_available: supplied?.notification_available ?? false,
    adapters: [...localAdapters, ...suppliedAdapters],
    local_database: {
      available: databaseAvailable,
      path: databasePath,
      writable,
      ...(error ? { error } : {})
    }
  });
}
