import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import open from "open";
import {
  DailyChiefDatabase,
  dailyPlanSchema,
  onboardingDraftTaskSchema,
  onboardingStateSchema,
  settingsSchema,
  sourceSnapshotSchema,
  taskOccursOn,
  validateDailyPlan,
  type DailyPlan,
  type OnboardingState,
  type Settings,
  type Task
} from "@banpie/daily-chief-core";
import { generateFromDatabase } from "./generate.js";
import { importStandardContent } from "./import-file.js";
import { runDoctor } from "./doctor.js";

export interface ServeOptions {
  port: number;
  openBrowser: boolean;
  databasePath: string;
  token?: string;
  hostReportPath?: string;
  now?: () => Date;
}

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function onboardingPreviewDate(settings: Settings, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const time = `${values.hour}:${values.minute}`;
  if (time < settings.work_end) return date;
  const tomorrow = new Date(`${date}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function dateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function startServer(options: ServeOptions): Promise<{ url: string; token: string; close: () => Promise<void> }> {
  const db = new DailyChiefDatabase(options.databasePath);
  const token = options.token ?? randomBytes(24).toString("base64url");
  const doctor = runDoctor(options.databasePath, options.hostReportPath);
  const now = options.now ?? (() => new Date());
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => response.json({ ok: true, bind: "127.0.0.1" }));
  app.use("/api", (request: Request, response: Response, next: NextFunction) => {
    const provided = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? request.headers["x-daily-chief-token"];
    if (provided !== token) return response.status(401).json({ error: "unauthorized" });
    next();
  });

  app.get("/api/bootstrap", (_request, response) => {
    const settings = db.getSettings();
    const tasks = db.listTasks();
    const current = now();
    const occurrenceDate = dateInTimezone(settings.timezone, current);
    response.json({
      settings,
      tasks,
      recurring_occurrences_today: tasks.filter((task) => task.recurrence_rrule && taskOccursOn(task, occurrenceDate, settings.timezone)).map((task) => task.task_id),
      completed_occurrences_today: tasks.filter((task) => task.recurrence_rrule && db.isTaskOccurrenceCompleted(task.task_id, occurrenceDate)).map((task) => task.task_id),
      projects: db.listProjects(),
      snapshots: db.latestSnapshots(current),
      brief: db.latestBrief(),
      plan: db.latestBrief() ? db.getDailyPlan(db.latestBrief()!.date) ?? null : null,
      onboarding: db.getOnboardingState(),
      doctor,
      runs: db.listRunLogs(50)
    });
  });
  app.get("/api/tasks", (request, response) => response.json(db.listTasks({
    ...(typeof request.query.status === "string" ? { status: request.query.status as Task["status"] } : {}),
    ...(typeof request.query.project_id === "string" ? { project_id: request.query.project_id } : {})
  })));
  app.post("/api/tasks", (request, response) => {
    try {
      response.status(201).json(db.createTask(request.body));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.patch("/api/tasks/:taskId", (request, response) => {
    try {
      response.json(db.updateTask(request.params.taskId, request.body));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.post("/api/tasks/:taskId/complete", (request, response) => {
    try {
      response.json(db.completeTask(request.params.taskId, typeof request.body?.occurrence_date === "string" ? request.body.occurrence_date : undefined));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.post("/api/tasks/:taskId/reopen", (request, response) => {
    try {
      const date = typeof request.body?.occurrence_date === "string" ? request.body.occurrence_date : new Date().toISOString().slice(0, 10);
      response.json(db.reopenTaskOccurrence(request.params.taskId, date));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/projects", (_request, response) => response.json(db.listProjects()));
  app.post("/api/projects", (request, response) => {
    try {
      response.status(201).json(db.createProject(request.body));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.patch("/api/projects/:projectId", (request, response) => {
    try {
      response.json(db.updateProject(request.params.projectId, request.body));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/settings", (_request, response) => response.json(db.getSettings()));
  app.patch("/api/settings", (request, response) => {
    try {
      const parsed = settingsSchema.partial().parse(request.body);
      const patch = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)) as Partial<Settings>;
      response.json(db.saveSettings(patch));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/doctor", (_request, response) => response.json(doctor));
  app.get("/api/onboarding", (_request, response) => response.json(db.getOnboardingState()));
  app.patch("/api/onboarding", (request, response) => {
    try {
      const parsed = onboardingStateSchema.partial().parse(request.body) as Partial<OnboardingState>;
      const completed = Boolean(parsed.completed_at);
      if (completed) db.saveSettings({ onboarding_completed: true });
      response.json(db.saveOnboardingState(parsed));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.post("/api/onboarding/preview", (request, response) => {
    try {
      const drafts = onboardingDraftTaskSchema.array().min(3).max(10).parse(request.body?.tasks);
      const state = db.getOnboardingState();
      const taskIds: string[] = [];
      drafts.forEach((draft, index) => {
        const existingId = state.seed_task_ids[index];
        const existing = existingId ? db.getTask(existingId) : undefined;
        const task = existing
          ? db.updateTask(existing.task_id, { title: draft.title, status: "next", estimate_minutes: draft.estimate_minutes, priority: draft.priority })
          : db.createTask({ title: draft.title, status: "next", estimate_minutes: draft.estimate_minutes, priority: draft.priority });
        taskIds.push(task.task_id);
      });
      state.seed_task_ids.slice(drafts.length).forEach((taskId) => {
        if (db.getTask(taskId)) db.updateTask(taskId, { status: "canceled" });
      });
      const current = now();
      const { brief, plan } = generateFromDatabase(db, onboardingPreviewDate(db.getSettings(), current), current);
      const onboarding = db.saveOnboardingState({ current_step: 7, draft_tasks: drafts, seed_task_ids: taskIds, preview_brief_id: brief.brief_id });
      response.json({ onboarding, brief, plan });
    } catch (caught) {
      response.status(422).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/snapshots", (_request, response) => response.json(db.latestSnapshots()));
  app.post("/api/import", (request, response) => {
    try {
      const filename = typeof request.body?.filename === "string" ? request.body.filename : "";
      const content = typeof request.body?.content === "string" ? request.body.content : "";
      const sourceId = typeof request.body?.source_id === "string" ? request.body.source_id : "";
      if (!filename || !sourceId.match(/^[A-Za-z0-9._-]{1,80}$/)) throw new Error("Invalid filename or source_id");
      if (!content || Buffer.byteLength(content, "utf8") > 1024 * 1024) throw new Error("Import file must be between 1 byte and 1 MB");
      const snapshot = importStandardContent({ filename, content, sourceId, timezone: db.getSettings().timezone });
      response.status(201).json(db.saveSnapshot(snapshot));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.post("/api/snapshots", (request, response) => {
    try {
      response.status(201).json(db.saveSnapshot(sourceSnapshotSchema.parse(request.body)));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/briefs/latest", (request, response) => response.json(db.latestBrief(typeof request.query.date === "string" ? request.query.date : undefined) ?? null));
  app.post("/api/generate", (request, response) => {
    try {
      response.json(generateFromDatabase(db, typeof request.body?.date === "string" ? request.body.date : undefined, now()).brief);
    } catch (caught) {
      response.status(422).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/plans/:date", (request, response) => response.json(db.getDailyPlan(request.params.date) ?? null));
  app.patch("/api/plans/:date", (request, response) => {
    try {
      const brief = db.latestBrief(request.params.date);
      const current = db.getDailyPlan(request.params.date);
      if (!brief || !current) return response.status(404).json({ error: "Daily plan not found" });
      const candidate = dailyPlanSchema.parse({
        ...current,
        ...request.body,
        plan_id: current.plan_id,
        date: current.date,
        brief_id: current.brief_id,
        created_at: current.created_at,
        adjusted: request.body?.time_blocks !== undefined || request.body?.action_order !== undefined ? true : current.adjusted,
        updated_at: now().toISOString()
      }) as DailyPlan;
      const validation = validateDailyPlan(candidate, brief, now());
      if (!validation.valid) return response.status(422).json({ error: validation.issues.map((issue) => issue.message).join(" "), issues: validation.issues });
      response.json(db.saveDailyPlan(candidate));
    } catch (caught) {
      response.status(400).json({ error: caught instanceof Error ? caught.message : String(caught) });
    }
  });
  app.get("/api/runs", (_request, response) => response.json(db.listRunLogs(100)));
  app.post("/api/cleanup", (_request, response) => response.json(db.cleanup()));

  if (existsSync(publicDirectory)) {
    app.use(express.static(publicDirectory, { fallthrough: true, index: "index.html" }));
    app.use((_request, response) => response.sendFile(join(publicDirectory, "index.html")));
  } else {
    app.use((_request, response) => response.status(503).send("Dashboard assets are missing. Run npm run build first."));
  }

  const server = app.listen(options.port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  server.on("close", () => db.close());
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const url = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
  if (options.openBrowser) await open(url);
  return { url, token, close: () => new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())) };
}
