import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type DatabaseType from "better-sqlite3";
import {
  dailyBriefSchema,
  defaultSettings,
  projectSchema,
  settingsSchema,
  sourceSnapshotSchema,
  taskSchema,
  type DailyBrief,
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
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
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
      ...(input.context ? { context: input.context } : {}),
      ...(input.next_action ? { next_action: input.next_action } : {})
    });
    this.saveTask(task);
    return task;
  }

  updateTask(taskId: string, input: Partial<Omit<Task, "task_id" | "created_at">>): Task {
    const existing = this.getTask(taskId);
    if (!existing) throw new Error(`Task not found: ${taskId}`);
    const completedAt = input.status === "done" && !existing.completed_at ? new Date().toISOString() : input.completed_at ?? existing.completed_at;
    const task = taskSchema.parse({
      ...existing,
      ...input,
      task_id: existing.task_id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
      ...(completedAt ? { completed_at: completedAt } : {})
    });
    this.saveTask(task);
    return task;
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
      ? this.db.prepare("SELECT payload FROM daily_briefs WHERE brief_date = ? ORDER BY generated_at DESC LIMIT 1").get(date)
      : this.db.prepare("SELECT payload FROM daily_briefs ORDER BY generated_at DESC LIMIT 1").get();
    return row ? dailyBriefSchema.parse(JSON.parse((row as { payload: string }).payload)) : undefined;
  }

  listBriefs(limit = 30): DailyBrief[] {
    return (this.db.prepare("SELECT payload FROM daily_briefs ORDER BY generated_at DESC LIMIT ?").all(limit) as Array<{ payload: string }>)
      .map((row) => dailyBriefSchema.parse(JSON.parse(row.payload)));
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
