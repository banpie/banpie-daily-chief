import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_VERSION,
  DailyChiefDatabase,
  deduplicateCandidates,
  defaultSettings,
  generateDailyBrief,
  renderDailyBriefMarkdown,
  sourceSnapshotSchema,
  taskToCandidate,
  validateDailyBrief,
  type Candidate,
  type SourceSnapshot
} from "./index.js";

const tempDirectories: string[] = [];
afterEach(() => { while (tempDirectories.length) rmSync(tempDirectories.pop()!, { recursive: true, force: true }); });

const now = new Date("2026-08-27T01:00:00.000Z");
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  candidate_id: overrides.candidate_id ?? "candidate-1",
  kind: overrides.kind ?? "task",
  title: overrides.title ?? "完成首版",
  source_id: overrides.source_id ?? "local.tasks",
  actor: overrides.actor ?? "self",
  priority: overrides.priority ?? "p1",
  all_day: overrides.all_day ?? false,
  ...overrides
});
const snapshot = (overrides: Partial<SourceSnapshot> = {}): SourceSnapshot => sourceSnapshotSchema.parse({
  schema_version: API_VERSION,
  snapshot_id: overrides.snapshot_id ?? "snapshot-1",
  source_id: overrides.source_id ?? "local.tasks",
  capability: overrides.capability ?? "tasks.read",
  captured_at: overrides.captured_at ?? now.toISOString(),
  timezone: overrides.timezone ?? "Asia/Shanghai",
  status: overrides.status ?? "ok",
  expires_at: overrides.expires_at ?? "2026-08-28T00:00:00+08:00",
  items: overrides.items ?? [candidate()]
});

describe("source contract", () => {
  it("rejects fresh items when a source read failed", () => {
    expect(() => sourceSnapshotSchema.parse({ ...snapshot(), status: "read_failed", items: [candidate()] })).toThrow();
  });

  it("accepts an explicit failed source without false zero items", () => {
    const result = sourceSnapshotSchema.parse({ ...snapshot(), status: "read_failed", items: [], failure_reason: "timeout" });
    expect(result.failure_reason).toBe("timeout");
  });
});

describe("normalization and planning", () => {
  it("deduplicates equivalent entries from different hosts by original URL", () => {
    const values = deduplicateCandidates([
      candidate({ candidate_id: "workbuddy", source_id: "workbuddy.tasks", source_ref: "https://tasks.example/42" }),
      candidate({ candidate_id: "codex", source_id: "codex.tasks", source_ref: "https://tasks.example/42" })
    ]);
    expect(values).toHaveLength(1);
  });

  it("keeps at most five actions and carries the rest into deferred", () => {
    const items = Array.from({ length: 8 }, (_, index) => candidate({ candidate_id: `c-${index}`, title: `行动 ${index}`, priority: index === 0 ? "p0" : "p2" }));
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: { ...defaultSettings, max_actions: 5 }, snapshots: [snapshot({ items })] });
    expect(brief.actions).toHaveLength(5);
    expect(brief.deferred).toHaveLength(3);
  });

  it("does not schedule editable blocks in the past during a late run", () => {
    const late = new Date("2026-08-27T08:00:00.000Z");
    const brief = generateDailyBrief({ date: "2026-08-27", now: late, settings: defaultSettings, snapshots: [snapshot()] });
    expect(brief.time_blocks.filter((block) => block.editable).every((block) => new Date(block.start_at) >= late)).toBe(true);
  });

  it("prioritizes a real deadline over a low-risk someday item", () => {
    const due = candidate({ candidate_id: "due", title: "今天交材料", due_at: "2026-08-27T10:00:00+08:00", priority: "p2" });
    const someday = candidate({ candidate_id: "later", title: "以后研究", status: "someday", priority: "p0" });
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: { ...defaultSettings, max_actions: 1 }, snapshots: [snapshot({ items: [someday, due] })] });
    expect(brief.actions[0]?.action_id).toBe("due");
  });

  it("marks the brief degraded when an optional source fails", () => {
    const failed = sourceSnapshotSchema.parse({ ...snapshot({ snapshot_id: "mail", source_id: "gmail", capability: "mail.read", items: [] }), status: "login_required", failure_reason: "expired" });
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [snapshot(), failed] });
    expect(brief.degraded).toBe(true);
    expect(brief.source_status.find((source) => source.source_id === "gmail")?.item_count).toBeNull();
  });

  it("renders web and chat output from the same DailyBrief object", () => {
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [snapshot()] });
    expect(renderDailyBriefMarkdown(brief)).toContain(brief.actions[0]!.title);
    expect(validateDailyBrief(brief, [snapshot()], now).valid).toBe(true);
  });

  it("renders deterministic English judgments and action reasons", () => {
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: { ...defaultSettings, language: "en" }, snapshots: [snapshot()] });
    expect(brief.judgment).toContain("primary actions");
    expect(brief.actions[0]?.reason).toMatch(/Important|capacity|deadline|planned|next action/i);
    expect(renderDailyBriefMarkdown(brief, "en")).toContain("## Actions");
  });

  it("produces semantically equivalent actions from WorkBuddy and Codex fixtures", () => {
    const workbuddy = sourceSnapshotSchema.parse(JSON.parse(readFileSync("fixtures/equivalent-workbuddy.json", "utf8")));
    const codex = sourceSnapshotSchema.parse(JSON.parse(readFileSync("fixtures/equivalent-codex.json", "utf8")));
    const left = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [workbuddy] });
    const right = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [codex] });
    expect(left.actions.map(({ title, estimate_minutes, due_at }) => ({ title, estimate_minutes, due_at })))
      .toEqual(right.actions.map(({ title, estimate_minutes, due_at }) => ({ title, estimate_minutes, due_at })));
  });

  it("keeps a cross-day all-day event visible on the covered date", () => {
    const event = candidate({ candidate_id: "trip", kind: "event", title: "跨日出差", start_at: "2026-11-01T04:00:00Z", end_at: "2026-11-03T05:00:00Z", all_day: true });
    const brief = generateDailyBrief({ date: "2026-11-02", now: new Date("2026-11-02T13:00:00Z"), settings: { ...defaultSettings, timezone: "America/New_York" }, snapshots: [snapshot({ timezone: "America/New_York", items: [event] })] });
    expect(brief.fixed_events.map((item) => item.title)).toContain("跨日出差");
  });

  it("reserves a visible buffer close to the configured 20 percent", () => {
    const items = [candidate({ candidate_id: "a", estimate_minutes: 60 }), candidate({ candidate_id: "b", title: "第二件", estimate_minutes: 60 })];
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [snapshot({ items })] });
    const editable = brief.time_blocks.filter((block) => block.kind !== "fixed");
    const minutes = (kind?: string) => editable.filter((block) => !kind || block.kind === kind).reduce((total, block) => total + (new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) / 60000, 0);
    expect(minutes("buffer") / minutes()).toBeGreaterThanOrEqual(0.19);
  });
});

describe("SQLite local task manager", () => {
  it("works without an external task app and preserves task dates", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const task = db.createTask({ title: "本地任务", status: "next", due_at: "2026-08-30T18:00:00+08:00", plan_date: "2026-08-27" });
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: db.getSettings(), snapshots: [snapshot({ items: [taskToCandidate(task)] })] });
    db.saveBrief(brief);
    expect(db.getTask(task.task_id)?.due_at).toBe("2026-08-30T18:00:00+08:00");
    expect(db.latestBrief()?.brief_id).toBe(brief.brief_id);
    db.close();
  });

  it("moves a completed task out of active planning", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const task = db.createTask({ title: "可完成任务", status: "next" });
    const done = db.updateTask(task.task_id, { status: "done" });
    expect(done.completed_at).toBeTruthy();
    expect(db.listTasks({ status: "done" })).toHaveLength(1);
    db.close();
  });
});
