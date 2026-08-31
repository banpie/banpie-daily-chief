import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type DatabaseType from "better-sqlite3";
import {
  API_VERSION,
  dailyBriefSchema,
  dailyPlanSchema,
  defaultOnboardingState,
  defaultSettings,
  onboardingStateSchema,
  projectSchema,
  settingsSchema,
  sourceSnapshotSchema,
  taskSchema,
  type DailyBrief,
  type DailyPlan,
  type OnboardingState,
  type Project,
  type Settings,
  type SourceSnapshot,
  type Task
} from "./contracts.js";

interface RunLog {
  run_id: string;
  started_at: string;
  finished_at: string;
  status: "success" | "degraded" | "failed";
  duration_ms: number;
  missing_sources: string[];
  error?: string;
  brief_id?: string;
}

type NewTask = Partial<Omit<Task, "task_id" | "created_at" | "updated_at">> & Pick<Task, "title">;
type TaskUpdate = Partial<Omit<Task, "task_id" | "created_at" | "due_at" | "plan_date" | "recurrence_rrule" | "recurrence_start_date" | "context" | "next_action">> & {
  due_at?: string | null;
  plan_date?: string | null;
  recurrence_rrule?: string | null;
  recurrence_start_date?: string | null;
  context?: string | null;
  next_action?: string | null;
};
type NewProject = Partial<Omit<Project, "project_id" | "created_at" | "updated_at">> & Pick<Project, "title">;

const require = createRequire(import.meta.url);

function loadDatabase(): typeof DatabaseType {
  const major = Number(process.versions.node.split(".")[0]);
  const candidates = major <= 20
    ? ["better-sqlite3-node20", "better-sqlite3-modern"]
    : ["better-sqlite3-modern", "better-sqlite3-node20"];
  const errors: string[] = [];
  for (const packageName of candidates) {
    try {
      return require(packageName) as typeof DatabaseType;
    } catch (error) {
      errors.push(`${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No compatible SQLite runtime is installed for Node ${process.versions.node}. ${errors.join(" | ")}`);
}

const Database = loadDatabase();

export class DailyChiefDatabase {
  readonly path: string;
  private readonly db: DatabaseType.Database;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        project_id TEXT,
        due_at TEXT,
        plan_date TEXT,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE TABLE IF NOT EXISTS source_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        status TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        expires_at TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_source_time ON source_snapshots(source_id, captured_at DESC);
      CREATE TABLE IF NOT EXISTS daily_briefs (
        brief_id TEXT PRIMARY KEY,
        brief_date TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        degraded INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_briefs_date ON daily_briefs(brief_date, generated_at DESC);
      CREATE TABLE IF NOT EXISTS run_logs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        brief_id TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_run_logs_time ON run_logs(started_at DESC);
      CREATE TABLE IF NOT EXISTS settings (
        settings_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS onboarding_state (
        state_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_plans (
        plan_id TEXT PRIMARY KEY,
        plan_date TEXT NOT NULL UNIQUE,
        brief_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date, updated_at DESC);
      CREATE TABLE IF NOT EXISTS task_occurrence_completions (
        task_id TEXT NOT NULL,
        occurrence_date TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        PRIMARY KEY(task_id, occurrence_date)
      );
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'));
    `);
  }

  getSettings(): Settings {
    const row = this.db.prepare("SELECT payload FROM settings WHERE settings_id = 'default'").get() as { payload: string } | undefined;
    if (!row) return defaultSettings;
    return settingsSchema.parse(JSON.parse(row.payload));
  }

  saveSettings(input: Partial<Settings>): Settings {
    const settings = settingsSchema.parse({ ...this.getSettings(), ...input });
    this.db.prepare(`
      INSERT INTO settings(settings_id, payload, updated_at) VALUES ('default', ?, ?)
      ON CONFLICT(settings_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(JSON.stringify(settings), new Date().toISOString());
    return settings;
  }

  getOnboardingState(): OnboardingState {
    const row = this.db.prepare("SELECT payload FROM onboarding_state WHERE state_id = 'default'").get() as { payload: string } | undefined;
    if (!row) return { ...defaultOnboardingState, updated_at: new Date().toISOString() };
    return onboardingStateSchema.parse(JSON.parse(row.payload));
  }

  saveOnboardingState(input: Partial<OnboardingState>): OnboardingState {
    const current = this.getOnboardingState();
    const state = onboardingStateSchema.parse({ ...current, ...input, schema_version: API_VERSION, updated_at: new Date().toISOString() });
    this.db.prepare(`
      INSERT INTO onboarding_state(state_id, payload, updated_at) VALUES ('default', ?, ?)
      ON CONFLICT(state_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(JSON.stringify(state), state.updated_at);
    return state;
  }

  listTasks(options: { status?: Task["status"]; project_id?: string } = {}): Task[] {
    const where: string[] = [];
    const params: string[] = [];
    if (options.status) {
      where.push("status = ?");
      params.push(options.status);
    }
    if (options.project_id) {
      where.push("project_id = ?");
      params.push(options.project_id);
    }
    const sql = `SELECT payload FROM tasks${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(due_at, '9999') ASC, updated_at DESC`;
    return (this.db.prepare(sql).all(...params) as Array<{ payload: string }>).map((row) => taskSchema.parse(JSON.parse(row.payload)));
  }

  getTask(taskId: string): Task | undefined {
    const row = this.db.prepare("SELECT payload FROM tasks WHERE task_id = ?").get(taskId) as { payload: string } | undefined;
    return row ? taskSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  createTask(input: NewTask): Task {
    const now = new Date().toISOString();
    const task = taskSchema.parse({
      task_id: randomUUID(),
      title: input.title,
      notes: input.notes ?? "",
      status: input.status ?? "inbox",
      project_id: input.project_id ?? null,
      estimate_minutes: input.estimate_minutes ?? 30,
      priority: input.priority ?? "p2",
      created_at: now,
      updated_at: now,
      ...(input.due_at ? { due_at: input.due_at } : {}),
      ...(input.plan_date ? { plan_date: input.plan_date } : {}),
      ...(input.recurrence_rrule ? { recurrence_rrule: input.recurrence_rrule } : {}),
      ...(input.recurrence_start_date ? { recurrence_start_date: input.recurrence_start_date } : {}),
      ...(input.context ? { context: input.context } : {}),
      ...(input.next_action ? { next_action: input.next_action } : {})
    });
    this.saveTask(task);
    return task;
  }

  updateTask(taskId: string, input: TaskUpdate): Task {
    const existing = this.getTask(taskId);
    if (!existing) throw new Error(`Task not found: ${taskId}`);
    const nextStatus = input.status ?? existing.status;
    const completedAt = nextStatus === "done"
      ? (input.completed_at ?? existing.completed_at ?? new Date().toISOString())
      : undefined;
    const merged: Record<string, unknown> = {
      ...existing,
      ...input,
      task_id: existing.task_id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
      completed_at: completedAt
    };
    for (const key of ["due_at", "plan_date", "recurrence_rrule", "recurrence_start_date", "context", "next_action"] as const) {
      if (input[key] === null || input[key] === "") delete merged[key];
    }
    const task = taskSchema.parse(merged);
    this.saveTask(task);
    return task;
  }

  completeTask(taskId: string, occurrenceDate?: string): Task {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.recurrence_rrule) return this.updateTask(taskId, { status: "done" });
    if (!occurrenceDate) throw new Error("occurrence_date is required for a recurring task");
    this.db.prepare(`
      INSERT INTO task_occurrence_completions(task_id, occurrence_date, completed_at) VALUES (?, ?, ?)
      ON CONFLICT(task_id, occurrence_date) DO UPDATE SET completed_at = excluded.completed_at
    `).run(taskId, occurrenceDate, new Date().toISOString());
    return task;
  }

  reopenTaskOccurrence(taskId: string, occurrenceDate: string): Task {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.recurrence_rrule) {
      this.db.prepare("DELETE FROM task_occurrence_completions WHERE task_id = ? AND occurrence_date = ?").run(taskId, occurrenceDate);
      return task;
    }
    return this.updateTask(taskId, { status: "next", completed_at: undefined });
  }

  isTaskOccurrenceCompleted(taskId: string, occurrenceDate: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 AS found FROM task_occurrence_completions WHERE task_id = ? AND occurrence_date = ?").get(taskId, occurrenceDate));
  }

  private saveTask(task: Task): void {
    this.db.prepare(`
      INSERT INTO tasks(task_id, status, project_id, due_at, plan_date, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET status = excluded.status, project_id = excluded.project_id,
        due_at = excluded.due_at, plan_date = excluded.plan_date, updated_at = excluded.updated_at, payload = excluded.payload
    `).run(task.task_id, task.status, task.project_id, task.due_at ?? null, task.plan_date ?? null, task.updated_at, JSON.stringify(task));
  }

  listProjects(): Project[] {
    return (this.db.prepare("SELECT payload FROM projects ORDER BY status = 'active' DESC, updated_at DESC").all() as Array<{ payload: string }>)
      .map((row) => projectSchema.parse(JSON.parse(row.payload)));
  }

  getProject(projectId: string): Project | undefined {
    const row = this.db.prepare("SELECT payload FROM projects WHERE project_id = ?").get(projectId) as { payload: string } | undefined;
    return row ? projectSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  createProject(input: NewProject): Project {
    const now = new Date().toISOString();
    const project = projectSchema.parse({
      project_id: randomUUID(),
      title: input.title,
      outcome: input.outcome ?? "",
      status: input.status ?? "active",
      current_focus: input.current_focus ?? "",
      next_action: input.next_action ?? "",
      notes: input.notes ?? "",
      created_at: now,
      updated_at: now
    });
    this.saveProject(project);
    return project;
  }

  updateProject(projectId: string, input: Partial<Omit<Project, "project_id" | "created_at">>): Project {
    const existing = this.getProject(projectId);
    if (!existing) throw new Error(`Project not found: ${projectId}`);
    const project = projectSchema.parse({ ...existing, ...input, project_id: existing.project_id, created_at: existing.created_at, updated_at: new Date().toISOString() });
    this.saveProject(project);
    return project;
  }

  private saveProject(project: Project): void {
    this.db.prepare(`
      INSERT INTO projects(project_id, status, updated_at, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, payload = excluded.payload
    `).run(project.project_id, project.status, project.updated_at, JSON.stringify(project));
  }

  saveSnapshot(input: SourceSnapshot): SourceSnapshot {
    const snapshot = sourceSnapshotSchema.parse(input);
    this.db.prepare(`
      INSERT INTO source_snapshots(snapshot_id, source_id, capability, status, captured_at, expires_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_id) DO UPDATE SET status = excluded.status, captured_at = excluded.captured_at,
        expires_at = excluded.expires_at, payload = excluded.payload
    `).run(snapshot.snapshot_id, snapshot.source_id, snapshot.capability, snapshot.status, snapshot.captured_at, snapshot.expires_at ?? null, JSON.stringify(snapshot));
    return snapshot;
  }

  latestSnapshots(now = new Date()): SourceSnapshot[] {
    const rows = this.db.prepare(`
      SELECT payload FROM source_snapshots s
      WHERE captured_at = (SELECT MAX(captured_at) FROM source_snapshots WHERE source_id = s.source_id)
      ORDER BY source_id
    `).all() as Array<{ payload: string }>;
    return rows.map((row) => {
      const snapshot = sourceSnapshotSchema.parse(JSON.parse(row.payload));
      if (snapshot.status === "ok" && snapshot.expires_at && new Date(snapshot.expires_at) < now) {
        return sourceSnapshotSchema.parse({ ...snapshot, status: "stale", items: [], failure_reason: "Snapshot expired before this run." });
      }
      return snapshot;
    });
  }

  saveBrief(input: DailyBrief): DailyBrief {
    const brief = dailyBriefSchema.parse(input);
    this.db.prepare(`
      INSERT INTO daily_briefs(brief_id, brief_date, generated_at, degraded, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(brief_id) DO UPDATE SET payload = excluded.payload
    `).run(brief.brief_id, brief.date, brief.generated_at, brief.degraded ? 1 : 0, JSON.stringify(brief));
    return brief;
  }

  latestBrief(date?: string): DailyBrief | undefined {
    const row = date
      ? this.db.prepare("SELECT payload FROM daily_briefs WHERE brief_date = ? ORDER BY generated_at DESC, rowid DESC LIMIT 1").get(date)
      : this.db.prepare("SELECT payload FROM daily_briefs ORDER BY generated_at DESC, rowid DESC LIMIT 1").get();
    return row ? dailyBriefSchema.parse(JSON.parse((row as { payload: string }).payload)) : undefined;
  }

  listBriefs(limit = 30): DailyBrief[] {
    return (this.db.prepare("SELECT payload FROM daily_briefs ORDER BY generated_at DESC, rowid DESC LIMIT ?").all(limit) as Array<{ payload: string }>)
      .map((row) => dailyBriefSchema.parse(JSON.parse(row.payload)));
  }

  createPlanFromBrief(brief: DailyBrief): DailyPlan {
    const existing = this.getDailyPlan(brief.date);
    const now = new Date().toISOString();
    const fixedSignature = (blocks: DailyPlan["time_blocks"]) => JSON.stringify(blocks
      .filter((block) => block.kind === "fixed")
      .map(({ title, start_at, end_at, editable }) => ({ title, start_at, end_at, editable }))
      .sort((left, right) => `${left.start_at}\u0000${left.end_at}\u0000${left.title}`.localeCompare(`${right.start_at}\u0000${right.end_at}\u0000${right.title}`)));
    const compatible = Boolean(existing)
      && [...existing!.action_order].sort().join("\u0000") === brief.actions.map((action) => action.action_id).sort().join("\u0000")
      && fixedSignature(existing!.time_blocks) === fixedSignature(brief.time_blocks);
    if (existing?.adjusted && compatible) {
      return this.saveDailyPlan({ ...existing, brief_id: brief.brief_id });
    }
    return this.saveDailyPlan(dailyPlanSchema.parse({
      schema_version: API_VERSION,
      plan_id: existing?.plan_id ?? randomUUID(),
      date: brief.date,
      brief_id: brief.brief_id,
      accepted: compatible ? existing?.accepted ?? false : false,
      adjusted: false,
      action_order: brief.actions.map((action) => action.action_id),
      time_blocks: brief.time_blocks,
      created_at: existing?.created_at ?? now,
      updated_at: now
    }));
  }

  getDailyPlan(date: string): DailyPlan | undefined {
    const row = this.db.prepare("SELECT payload FROM daily_plans WHERE plan_date = ?").get(date) as { payload: string } | undefined;
    return row ? dailyPlanSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  saveDailyPlan(input: DailyPlan): DailyPlan {
    const plan = dailyPlanSchema.parse({ ...input, updated_at: new Date().toISOString() });
    this.db.prepare(`
      INSERT INTO daily_plans(plan_id, plan_date, brief_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(plan_date) DO UPDATE SET plan_id = excluded.plan_id, brief_id = excluded.brief_id,
        updated_at = excluded.updated_at, payload = excluded.payload
    `).run(plan.plan_id, plan.date, plan.brief_id, plan.updated_at, JSON.stringify(plan));
    return plan;
  }

  saveRunLog(input: Omit<RunLog, "run_id"> & { run_id?: string }): RunLog {
    const log: RunLog = { ...input, run_id: input.run_id ?? randomUUID() };
    this.db.prepare(`
      INSERT INTO run_logs(run_id, started_at, finished_at, status, duration_ms, brief_id, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(log.run_id, log.started_at, log.finished_at, log.status, log.duration_ms, log.brief_id ?? null, JSON.stringify(log));
    return log;
  }

  listRunLogs(limit = 100): RunLog[] {
    return (this.db.prepare("SELECT payload FROM run_logs ORDER BY started_at DESC LIMIT ?").all(limit) as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as RunLog);
  }

  cleanup(settings = this.getSettings(), now = new Date()): { snapshots: number; briefs: number } {
    const snapshotCutoff = new Date(now.getTime() - settings.snapshot_retention_days * 86400000).toISOString();
    const briefCutoff = new Date(now.getTime() - settings.brief_retention_days * 86400000).toISOString();
    const snapshots = this.db.prepare("DELETE FROM source_snapshots WHERE captured_at < ?").run(snapshotCutoff).changes;
    const briefs = this.db.prepare("DELETE FROM daily_briefs WHERE generated_at < ?").run(briefCutoff).changes;
    return { snapshots, briefs };
  }
}

export type { RunLog, NewTask, NewProject };
