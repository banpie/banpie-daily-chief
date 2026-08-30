import { randomUUID } from "node:crypto";
import {
  API_VERSION,
  DailyChiefDatabase,
  generateDailyBrief,
  renderDailyBriefMarkdown,
  sourceSnapshotSchema,
  taskToCandidate,
  taskCandidateForDate,
  taskOccursOn,
  validateDailyBrief,
  type DailyBrief,
  type DailyPlan,
  type SourceSnapshot
} from "@banpie/daily-chief-core";

export function dateInTimezone(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function generateFromDatabase(db: DailyChiefDatabase, date?: string, now = new Date()): { brief: DailyBrief; plan: DailyPlan; snapshots: SourceSnapshot[] } {
  const started = Date.now();
  const startedAt = now.toISOString();
  const settings = db.getSettings();
  const briefDate = date ?? dateInTimezone(settings.timezone, now);
  const tasks = db.listTasks().filter((task) => {
    if (task.status === "canceled" || task.status === "done") return false;
    if (!task.recurrence_rrule) return true;
    return taskOccursOn(task, briefDate, settings.timezone) && !db.isTaskOccurrenceCompleted(task.task_id, briefDate);
  });
  const localSnapshot = sourceSnapshotSchema.parse({
    schema_version: API_VERSION,
    snapshot_id: `local:${randomUUID()}`,
    source_id: "local.tasks",
    capability: "tasks.read",
    captured_at: now.toISOString(),
    timezone: settings.timezone,
    status: "ok",
    expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
    items: tasks.map((task) => task.recurrence_rrule ? taskCandidateForDate(task, briefDate) : taskToCandidate(task))
  });
  const snapshots = [...db.latestSnapshots(now).filter((snapshot) => snapshot.source_id !== "local.tasks"), localSnapshot];

  try {
    const brief = generateDailyBrief({ date: briefDate, now, settings, snapshots });
    const validation = validateDailyBrief(brief, snapshots, now);
    if (!validation.valid) throw new Error(validation.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("\n"));
    db.saveBrief(brief);
    const plan = db.createPlanFromBrief(brief);
    db.saveRunLog({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: brief.degraded ? "degraded" : "success",
      duration_ms: Date.now() - started,
      missing_sources: brief.source_status.filter((source) => source.status !== "ok").map((source) => source.source_id),
      brief_id: brief.brief_id
    });
    return { brief, plan, snapshots };
  } catch (caught) {
    db.saveRunLog({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      duration_ms: Date.now() - started,
      missing_sources: [],
      error: caught instanceof Error ? caught.message : String(caught)
    });
    throw caught;
  }
}

export function formatBrief(brief: DailyBrief, format: "json" | "markdown", language: "zh-CN" | "en"): string {
  return format === "json" ? `${JSON.stringify(brief, null, 2)}\n` : renderDailyBriefMarkdown(brief, language);
}
