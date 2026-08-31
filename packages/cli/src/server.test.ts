import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { API_VERSION } from "@banpie/daily-chief-core";
import { startServer } from "./server.js";
import { runDoctor } from "./doctor.js";

const directories: string[] = [];
const servers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!();
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "daily-chief-server-"));
  directories.push(directory);
  const reportPath = join(directory, "host-report.json");
  writeFileSync(reportPath, JSON.stringify({
    schema_version: API_VERSION,
    checked_at: new Date().toISOString(),
    agent_host: "Codex test fixture",
    operating_system: process.platform,
    node_version: process.version,
    scheduler_available: true,
    notification_available: false,
    adapters: [{
      adapter_id: "fixture-calendar", api_version: API_VERSION, capabilities: ["calendar.read"], host: "Codex", operating_system: process.platform,
      provider: "Fixture", available: false, needs_login: true, read_only: true, failure_reason: "login expired", recovery_hint: "Reconnect in host"
    }],
    local_database: { available: true, path: "host-owned", writable: true }
  }));
  let current = new Date("2026-08-27T01:17:31.000Z");
  const server = await startServer({ port: 0, openBrowser: false, databasePath: join(directory, "data.sqlite"), token: "test-token", hostReportPath: reportPath, now: () => current });
  servers.push(server.close);
  return {
    base: server.url.split("/?")[0]!,
    auth: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" },
    advance: (milliseconds: number) => { current = new Date(current.getTime() + milliseconds); }
  };
}

describe("local API security and onboarding", () => {
  it("does not infer the agent host from environment directories", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-doctor-"));
    directories.push(directory);
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = join(directory, "looks-like-codex");
    try {
      expect(runDoctor(join(directory, "data.sqlite"))).toMatchObject({
        agent_host: "Current host unknown",
        scheduler_available: false,
        notification_available: false
      });
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it("binds to loopback, rejects missing tokens and exposes the supplied host report", async () => {
    const { base, auth } = await setup();
    expect(await fetch(`${base}/api/health`).then((response) => response.json())).toEqual({ ok: true, bind: "127.0.0.1" });
    expect((await fetch(`${base}/api/bootstrap`)).status).toBe(401);
    expect((await fetch(`${base}/api/bootstrap`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    const doctor = await fetch(`${base}/api/doctor`, { headers: auth }).then((response) => response.json()) as { agent_host: string; adapters: Array<{ failure_reason?: string }> };
    expect(doctor.agent_host).toBe("Codex test fixture");
    expect(doctor.adapters.some((adapter) => adapter.failure_reason === "login expired")).toBe(true);
  });

  it("creates an idempotent three-task preview and accepts its daily plan", async () => {
    const { base, auth, advance } = await setup();
    const tasks = [
      { draft_id: "one", title: "第一项", estimate_minutes: 60, priority: "p1" },
      { draft_id: "two", title: "第二项", estimate_minutes: 30, priority: "p2" },
      { draft_id: "three", title: "第三项", estimate_minutes: 30, priority: "p2" }
    ];
    const preview = async () => fetch(`${base}/api/onboarding/preview`, { method: "POST", headers: auth, body: JSON.stringify({ tasks }) }).then(async (response) => {
      expect(response.status).toBe(200);
      return response.json() as Promise<{ brief: { date: string; actions: unknown[] }; plan: { date: string; accepted: boolean } }>;
    });
    const first = await preview();
    const second = await preview();
    expect(second.brief.actions).toHaveLength(3);
    const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: auth }).then((response) => response.json()) as { tasks: unknown[] };
    expect(bootstrap.tasks).toHaveLength(3);
    advance(60_000);
    const accepted = await fetch(`${base}/api/plans/${first.plan.date}`, { method: "PATCH", headers: auth, body: JSON.stringify({ accepted: true }) });
    const acceptedBody = await accepted.json() as { accepted?: boolean; error?: string };
    expect(accepted.status, acceptedBody.error).toBe(200);
    expect(acceptedBody.accepted).toBe(true);
  });

  it("rejects overlapping time-block edits and never serves a traversed package file", async () => {
    const { base, auth } = await setup();
    const tasks = [
      { draft_id: "one", title: "第一项", estimate_minutes: 60, priority: "p1" },
      { draft_id: "two", title: "第二项", estimate_minutes: 30, priority: "p2" },
      { draft_id: "three", title: "第三项", estimate_minutes: 30, priority: "p2" }
    ];
    const preview = await fetch(`${base}/api/onboarding/preview`, { method: "POST", headers: auth, body: JSON.stringify({ tasks }) }).then((response) => response.json()) as { plan: { date: string; time_blocks: Array<{ start_at: string; end_at: string }> } };
    const editable = preview.plan.time_blocks.filter((block) => block);
    const changed = preview.plan.time_blocks.map((block, index) => index === 1 ? { ...block, start_at: editable[0]!.start_at } : block);
    expect((await fetch(`${base}/api/plans/${preview.plan.date}`, { method: "PATCH", headers: auth, body: JSON.stringify({ time_blocks: changed }) })).status).toBe(422);
    const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
    expect(await traversal.text()).not.toContain('"name": "banpie-daily-chief"');
  });
});
