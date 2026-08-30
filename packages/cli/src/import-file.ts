import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ical, { type CalendarComponent, type VEvent } from "node-ical";
import { parse as parseCsv } from "csv-parse/sync";
import {
  API_VERSION,
  sourceSnapshotSchema,
  stableCandidateId,
  type Candidate,
  type SourceSnapshot
} from "@banpie/daily-chief-core";

interface ImportBaseOptions {
  sourceId: string;
  timezone: string;
  now?: Date;
}

export interface ImportFileOptions extends ImportBaseOptions {
  path: string;
}

export interface ImportContentOptions extends ImportBaseOptions {
  filename: string;
  content: string;
}

const makeSnapshot = (options: ImportBaseOptions, capability: SourceSnapshot["capability"], items: Candidate[]): SourceSnapshot => {
  const now = options.now ?? new Date();
  return sourceSnapshotSchema.parse({
    schema_version: API_VERSION,
    snapshot_id: `${options.sourceId}:${randomUUID()}`,
    source_id: options.sourceId,
    capability,
    captured_at: now.toISOString(),
    timezone: options.timezone,
    status: "ok",
    expires_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
    items
  });
};

export function importStandardFile(options: ImportFileOptions): SourceSnapshot {
  return importStandardContent({ ...options, filename: options.path, content: readFileSync(options.path, "utf8") });
}

export function importStandardContent(options: ImportContentOptions): SourceSnapshot {
  const extension = extname(options.filename).toLowerCase();
  if (extension === ".json") {
    const parsed: unknown = JSON.parse(options.content);
    const snapshot = sourceSnapshotSchema.safeParse(parsed);
    if (snapshot.success) return snapshot.data;
    if (!Array.isArray(parsed)) throw snapshot.error;
    return makeSnapshot(options, "tasks.read", parsed.map((row, index) => rowToCandidate(row, options.sourceId, index)));
  }
  if (extension === ".ics") return importIcs(options);
  if (extension === ".csv") {
    const rows = parseCsv(options.content, { columns: true, skip_empty_lines: true, trim: true }) as unknown[];
    return makeSnapshot(options, "tasks.read", rows.map((row, index) => rowToCandidate(row, options.sourceId, index)));
  }
  if ([".md", ".markdown", ".txt"].includes(extension)) return importText(options);
  throw new Error(`Unsupported file type: ${extension || "no extension"}. Use JSON, ICS, CSV, Markdown, or TXT.`);
}

function importIcs(options: ImportContentOptions): SourceSnapshot {
  const calendar = ical.sync.parseICS(options.content);
  const items: Candidate[] = [];
  for (const component of Object.values(calendar)) {
    if (!isCalendarEvent(component) || component.status === "CANCELLED") continue;
    const title = parameterText(component.summary) || "Untitled event";
    const start = component.start instanceof Date ? component.start : undefined;
    const end = component.end instanceof Date ? component.end : undefined;
    const base = {
      source_id: options.sourceId,
      external_id: typeof component.uid === "string" ? component.uid : undefined,
      title,
      start_at: start?.toISOString()
    };
    const item: Candidate = {
      candidate_id: stableCandidateId(base),
      kind: "event",
      title,
      source_id: options.sourceId,
      actor: "self",
      priority: "p2",
      all_day: Boolean(start && "dateOnly" in start && start.dateOnly),
      ...(typeof component.uid === "string" ? { external_id: component.uid } : {}),
      ...(start ? { start_at: start.toISOString() } : {}),
      ...(end ? { end_at: end.toISOString() } : {}),
      ...(component.description ? { notes: parameterText(component.description).slice(0, 5000) } : {})
    };
    items.push(item);
  }
  return makeSnapshot(options, "calendar.read", items);
}

function isCalendarEvent(component: CalendarComponent | undefined): component is VEvent {
  return component?.type === "VEVENT";
}

function parameterText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "val" in value) return String((value as { val: unknown }).val);
  return "";
}

function importText(options: ImportContentOptions): SourceSnapshot {
  const lines = options.content.split(/\r?\n/);
  const items = lines.flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const match = trimmed.match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
    const title = (match?.[2] ?? trimmed).trim();
    const done = Boolean(match?.[1] && match[1].toLowerCase() === "x");
    return [rowToCandidate({ title, status: done ? "done" : "inbox" }, options.sourceId, index)];
  });
  return makeSnapshot(options, "tasks.read", items);
}

function rowToCandidate(input: unknown, sourceId: string, index: number): Candidate {
  if (!input || typeof input !== "object") throw new Error(`Invalid task row at index ${index}`);
  const row = input as Record<string, unknown>;
  const title = String(row.title ?? row.task ?? row.name ?? "").trim();
  if (!title) throw new Error(`Missing title in task row ${index + 1}`);
  const externalId = row.external_id ?? row.id;
  const sourceRef = row.source_ref ?? row.url;
  const raw = {
    source_id: sourceId,
    external_id: externalId ? String(externalId) : undefined,
    source_ref: sourceRef ? String(sourceRef) : undefined,
    title,
    due_at: row.due_at ? String(row.due_at) : undefined,
    start_at: row.start_at ? String(row.start_at) : undefined
  };
  return {
    candidate_id: String(row.candidate_id ?? stableCandidateId(raw)),
    kind: row.kind === "mail" || row.kind === "signal" || row.kind === "event" ? row.kind : "task",
    title,
    source_id: sourceId,
    actor: row.actor === "other" || row.actor === "unknown" ? row.actor : "self",
    priority: row.priority === "p0" || row.priority === "p1" || row.priority === "p3" ? row.priority : "p2",
    all_day: row.all_day === true || row.all_day === "true",
    ...(externalId ? { external_id: String(externalId) } : {}),
    ...(sourceRef ? { source_ref: String(sourceRef) } : {}),
    ...(row.due_at ? { due_at: String(row.due_at) } : {}),
    ...(row.start_at ? { start_at: String(row.start_at) } : {}),
    ...(row.end_at ? { end_at: String(row.end_at) } : {}),
    ...(row.plan_date ? { plan_date: String(row.plan_date) } : {}),
    ...(row.estimate_minutes ? { estimate_minutes: Number(row.estimate_minutes) } : {}),
    ...(row.next_action ? { next_action: String(row.next_action) } : {}),
    ...(row.status && ["inbox", "next", "waiting", "someday", "done", "canceled"].includes(String(row.status)) ? { status: String(row.status) as Candidate["status"] } : {})
  };
}
