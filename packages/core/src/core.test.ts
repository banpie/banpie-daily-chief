import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_VERSION,
  DailyChiefDatabase,
  deduplicateCandidates,
  defaultSettings,
  generateDailyBrief,
  renderDailyBriefMarkdown,
  sourceSnapshotSchema,
  taskOccursOn,
  taskToCandidate,
  validateDailyBrief,
  validateDailyPlan,
  type Candidate,
  type SourceSnapshot
} from "./index.js";

const tempDirectories: string[] = [];
const require = createRequire(import.meta.url);
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

  it("does not let an expired successful snapshot masquerade as fresh data", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    db.saveSnapshot(snapshot({ expires_at: "2026-08-26T23:59:00Z" }));
    const [expired] = db.latestSnapshots(now);
    expect(expired).toMatchObject({ status: "stale", items: [], failure_reason: "Snapshot expired before this run." });
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [expired!] });
    expect(brief.actions).toHaveLength(0);
    expect(brief.source_status[0]).toMatchObject({ status: "stale", item_count: null });
    db.close();
  });
});

describe("SQLite local task manager", () => {
  it("migrates an older database without losing user tasks", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const path = join(directory, "data.sqlite");
    const packageName = Number(process.versions.node.split(".")[0]) <= 20 ? "better-sqlite3-node20" : "better-sqlite3-modern";
    const LegacyDatabase = require(packageName) as new (databasePath: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...values: unknown[]) => unknown };
      close: () => void;
    };
    const legacy = new LegacyDatabase(path);
    legacy.exec("CREATE TABLE tasks (task_id TEXT PRIMARY KEY, status TEXT NOT NULL, project_id TEXT, due_at TEXT, plan_date TEXT, updated_at TEXT NOT NULL, payload TEXT NOT NULL)");
    const timestamp = "2026-08-20T00:00:00.000Z";
    const payload = {
      task_id: "legacy-task", title: "升级前任务", notes: "保留我", status: "next", project_id: null,
      estimate_minutes: 45, priority: "p1", created_at: timestamp, updated_at: timestamp
    };
    legacy.prepare("INSERT INTO tasks(task_id, status, project_id, due_at, plan_date, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(payload.task_id, payload.status, null, null, null, timestamp, JSON.stringify(payload));
    legacy.close();

    const migrated = new DailyChiefDatabase(path);
    expect(migrated.getTask("legacy-task")).toMatchObject({ title: "升级前任务", notes: "保留我" });
    expect(migrated.getOnboardingState().current_step).toBe(1);
    migrated.close();
  });

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

  it("persists onboarding progress and its idempotent seed identifiers", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const path = join(directory, "data.sqlite");
    const db = new DailyChiefDatabase(path);
    const saved = db.saveOnboardingState({
      current_step: 6,
      device_ecosystem: "android_google",
      selected_sources: ["local.tasks", "google.calendar"],
      draft_tasks: [{ draft_id: "draft-1", title: "真实任务", estimate_minutes: 60, priority: "p1" }],
      seed_task_ids: ["task-1"]
    });
    db.close();
    const reopened = new DailyChiefDatabase(path);
    expect(reopened.getOnboardingState()).toMatchObject({ current_step: 6, device_ecosystem: "android_google", seed_task_ids: ["task-1"] });
    expect(saved.updated_at).not.toBe(new Date(0).toISOString());
    reopened.close();
  });

  it("completes one recurring occurrence without closing its series", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const task = db.createTask({ title: "工作日复盘", status: "next", recurrence_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", recurrence_start_date: "2026-08-24" });
    expect(taskOccursOn(task, "2026-08-27", "Asia/Shanghai")).toBe(true);
    expect(taskOccursOn(task, "2026-08-29", "Asia/Shanghai")).toBe(false);
    db.completeTask(task.task_id, "2026-08-27");
    expect(db.getTask(task.task_id)?.status).toBe("next");
    expect(db.isTaskOccurrenceCompleted(task.task_id, "2026-08-27")).toBe(true);
    db.reopenTaskOccurrence(task.task_id, "2026-08-27");
    expect(db.isTaskOccurrenceCompleted(task.task_id, "2026-08-27")).toBe(false);
    db.close();
  });

  it("keeps daily and monthly recurrence dates correct across daylight saving time", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const daily = db.createTask({ title: "每日整理", recurrence_rrule: "FREQ=DAILY", recurrence_start_date: "2026-03-07" });
    const monthly = db.createTask({ title: "每月核对", recurrence_rrule: "FREQ=MONTHLY", recurrence_start_date: "2026-01-31" });
    expect(taskOccursOn(daily, "2026-03-08", "America/New_York")).toBe(true);
    expect(taskOccursOn(daily, "2026-11-01", "America/New_York")).toBe(true);
    expect(taskOccursOn(monthly, "2026-03-31", "America/New_York")).toBe(true);
    expect(taskOccursOn(monthly, "2026-04-30", "America/New_York")).toBe(false);
    db.close();
  });

  it("clears optional task fields and fully edits a project", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const task = db.createTask({ title: "待编辑", due_at: "2026-08-30T10:00:00+08:00", plan_date: "2026-08-29", next_action: "先开始" });
    const updated = db.updateTask(task.task_id, { due_at: null, plan_date: null, next_action: null });
    expect(updated).not.toHaveProperty("due_at");
    expect(updated).not.toHaveProperty("plan_date");
    expect(updated).not.toHaveProperty("next_action");
    const project = db.createProject({ title: "开源发布" });
    expect(db.updateProject(project.project_id, { outcome: "新人十分钟看到预览", current_focus: "引导", next_action: "跑验收", notes: "只做个人版" })).toMatchObject({ outcome: "新人十分钟看到预览", current_focus: "引导", next_action: "跑验收", notes: "只做个人版" });
    db.close();
  });

  it("persists a versioned daily plan and rejects overlap or reduced buffer", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const brief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [snapshot({ items: [candidate(), candidate({ candidate_id: "candidate-2", title: "第二项" })] })] });
    db.saveBrief(brief);
    const plan = db.createPlanFromBrief(brief);
    const reordered = db.saveDailyPlan({ ...plan, accepted: true, adjusted: true, action_order: [...plan.action_order].reverse() });
    expect(db.getDailyPlan(brief.date)).toMatchObject({ accepted: true, adjusted: true, action_order: reordered.action_order });
    const withoutBuffer = { ...reordered, time_blocks: reordered.time_blocks.filter((block) => block.kind !== "buffer") };
    expect(validateDailyPlan(withoutBuffer, brief, now).issues.map((issue) => issue.code)).toContain("buffer_reduced");
    db.close();
  });

  it("reconciles an adjusted daily plan when its brief is regenerated", () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-chief-test-"));
    tempDirectories.push(directory);
    const db = new DailyChiefDatabase(join(directory, "data.sqlite"));
    const firstBrief = generateDailyBrief({ date: "2026-08-27", now, settings: defaultSettings, snapshots: [snapshot({ items: [candidate()] })] });
    db.saveBrief(firstBrief);
    const adjusted = db.saveDailyPlan({ ...db.createPlanFromBrief(firstBrief), accepted: true, adjusted: true });
    const equivalentBrief = { ...firstBrief, brief_id: "regenerated-equivalent", generated_at: "2026-08-27T02:00:00.000Z" };
    db.saveBrief(equivalentBrief);
    expect(db.createPlanFromBrief(equivalentBrief)).toMatchObject({
      brief_id: equivalentBrief.brief_id,
      accepted: true,
      adjusted: true,
      action_order: adjusted.action_order
    });

    const changedBrief = generateDailyBrief({
      date: "2026-08-27",
      now,
      settings: defaultSettings,
      snapshots: [snapshot({ items: [candidate({ candidate_id: "replacement", title: "替换后的行动" })] })]
    });
    db.saveBrief(changedBrief);
    expect(db.createPlanFromBrief(changedBrief)).toMatchObject({
      brief_id: changedBrief.brief_id,
      accepted: false,
      adjusted: false,
      action_order: changedBrief.actions.map((action) => action.action_id)
    });
    db.close();
  });
});
