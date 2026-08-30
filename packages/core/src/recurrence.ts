import { addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import rrulePackage from "rrule";
import { taskToCandidate } from "./normalize.js";
import type { Candidate, Task } from "./contracts.js";

const { rrulestr } = rrulePackage;

function anchorDate(task: Task, timezone: string): string {
  if (task.recurrence_start_date) return task.recurrence_start_date;
  if (task.plan_date) return task.plan_date;
  if (task.due_at) return format(toZonedTime(new Date(task.due_at), timezone), "yyyy-MM-dd");
  return format(toZonedTime(new Date(task.created_at), timezone), "yyyy-MM-dd");
}

export function taskOccursOn(task: Task, date: string, timezone: string): boolean {
  if (!task.recurrence_rrule) return true;
  const start = fromZonedTime(`${date}T00:00:00`, timezone);
  const end = fromZonedTime(`${format(addDays(new Date(`${date}T12:00:00Z`), 1), "yyyy-MM-dd")}T00:00:00`, timezone);
  const dtstart = fromZonedTime(`${anchorDate(task, timezone)}T09:00:00`, timezone);
  try {
    return rrulestr(task.recurrence_rrule, { dtstart }).between(start, end, true).length > 0;
  } catch (error) {
    throw new Error(`Invalid recurrence rule for task ${task.task_id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function taskCandidateForDate(task: Task, date: string): Candidate {
  const candidate = taskToCandidate(task);
  if (!task.recurrence_rrule) return candidate;
  return {
    ...candidate,
    candidate_id: `local:${task.task_id}:${date}`,
    external_id: `${task.task_id}:${date}`,
    plan_date: date,
    notes: [candidate.notes, `Recurring occurrence for ${date}`].filter(Boolean).join("\n")
  };
}
