import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import open from "open";
import {
  DailyChiefDatabase,
  settingsSchema,
  sourceSnapshotSchema,
  type Settings,
  type Task
} from "@banpie/daily-chief-core";
import { generateFromDatabase } from "./generate.js";

export interface ServeOptions {
  port: number;
  openBrowser: boolean;
  databasePath: string;
  token?: string;
}

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

export async function startServer(options: ServeOptions): Promise<{ url: string; token: string }> {
  const db = new DailyChiefDatabase(options.databasePath);
  const token = options.token ?? randomBytes(24).toString("base64url");
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
    response.json({
      settings: db.getSettings(),
      tasks: db.listTasks(),
      projects: db.listProjects(),
      snapshots: db.latestSnapshots(),
      brief: db.latestBrief(),
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
  app.get("/api/snapshots", (_request, response) => response.json(db.latestSnapshots()));
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
      response.json(generateFromDatabase(db, typeof request.body?.date === "string" ? request.body.date : undefined).brief);
    } catch (caught) {
      response.status(422).json({ error: caught instanceof Error ? caught.message : String(caught) });
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
  const url = `http://127.0.0.1:${options.port}/?token=${encodeURIComponent(token)}`;
  if (options.openBrowser) await open(url);
  return { url, token };
}
