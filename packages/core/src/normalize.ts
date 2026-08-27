import { createHash } from "node:crypto";
import type { Candidate, SourceSnapshot, Task } from "./contracts.js";

const titleKey = (title: string) => title.trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

export function stableCandidateId(candidate: Pick<Candidate, "source_id" | "external_id" | "source_ref" | "title" | "due_at" | "start_at">): string {
  const raw = [
    candidate.source_id,
    candidate.external_id ?? "",
    candidate.source_ref ?? "",
    titleKey(candidate.title),
    candidate.due_at ?? "",
    candidate.start_at ?? ""
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function taskToCandidate(task: Task): Candidate {
  const candidate: Candidate = {
    candidate_id: `local:${task.task_id}`,
    kind: "task",
    title: task.title,
    source_id: "local.tasks",
    external_id: task.task_id,
    actor: "self",
    estimate_minutes: task.estimate_minutes,
    status: task.status,
    priority: task.priority,
    all_day: false
  };
  if (task.due_at) candidate.due_at = task.due_at;
  if (task.plan_date) candidate.plan_date = task.plan_date;
  if (task.next_action) candidate.next_action = task.next_action;
  if (task.project_id) candidate.project_id = task.project_id;
  if (task.notes) candidate.notes = task.notes;
  return candidate;
}

function canonicalKey(candidate: Candidate): string {
  if (candidate.external_id) return `external:${candidate.external_id}`;
  if (candidate.source_ref) return `ref:${candidate.source_ref}`;
  return `semantic:${titleKey(candidate.title)}:${candidate.due_at ?? candidate.start_at ?? candidate.plan_date ?? ""}`;
}

export function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const keys = [canonicalKey(candidate)];
    if (candidate.source_ref) keys.push(`ref:${candidate.source_ref}`);
    const existingKey = keys.find((key) => byKey.has(key));
    if (!existingKey) {
      const normalized = { ...candidate, candidate_id: candidate.candidate_id || stableCandidateId(candidate) };
      for (const key of keys) byKey.set(key, normalized);
      continue;
    }
    const existing = byKey.get(existingKey);
    if (!existing) continue;
    const merged: Candidate = {
      ...existing,
      ...candidate,
      candidate_id: existing.candidate_id,
      priority: priorityRank(candidate.priority) < priorityRank(existing.priority) ? candidate.priority : existing.priority,
      estimate_minutes: candidate.estimate_minutes ?? existing.estimate_minutes,
      source_ref: existing.source_ref ?? candidate.source_ref
    };
    for (const key of keys) byKey.set(key, merged);
  }
  return [...new Set(byKey.values())];
}

export function flattenSnapshots(snapshots: SourceSnapshot[]): Candidate[] {
  return deduplicateCandidates(snapshots.filter((snapshot) => snapshot.status === "ok").flatMap((snapshot) => snapshot.items));
}

export function priorityRank(priority: Candidate["priority"]): number {
  return ({ p0: 0, p1: 1, p2: 2, p3: 3 })[priority];
}

