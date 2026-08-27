import { randomUUID } from "node:crypto";
import { addMinutes, areIntervalsOverlapping, compareAsc, format, isBefore, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  API_VERSION,
  dailyBriefSchema,
  type Candidate,
  type DailyBrief,
  type Settings,
  type SourceSnapshot
} from "./contracts.js";
import { deduplicateCandidates, flattenSnapshots, priorityRank } from "./normalize.js";

export interface GenerateBriefInput {
  date: string;
  now?: Date;
  settings: Settings;
  snapshots: SourceSnapshot[];
  localCandidates?: Candidate[];
}

const zonedInstant = (date: string, time: string, timezone: string): Date => fromZonedTime(`${date}T${time}:00`, timezone);
const iso = (date: Date): string => date.toISOString();

function isDueOnOrBefore(candidate: Candidate, date: string, timezone: string): boolean {
  if (!candidate.due_at) return false;
  const zoned = toZonedTime(parseISO(candidate.due_at), timezone);
  return zoned.toISOString().slice(0, 10) <= date;
}

function isPlanned(candidate: Candidate, date: string): boolean {
  return candidate.plan_date === date;
}

function actionReason(candidate: Candidate, date: string, timezone: string, language: Settings["language"]): string {
  const english = language === "en";
  if (candidate.due_at && isDueOnOrBefore(candidate, date, timezone)) {
    const dueDate = toZonedTime(parseISO(candidate.due_at), timezone).toISOString().slice(0, 10);
    return dueDate < date
      ? (english ? "The real deadline has passed; act today or explicitly renegotiate it" : "真实截止已过，需要今天处理或明确改约")
      : (english ? "The real deadline is today" : "今天到真实截止");
  }
  if (candidate.plan_date === date) return english ? "Already planned for today" : "已经计划今天推进";
  if (candidate.priority === "p0") return english ? "High impact and cannot be delayed further" : "高影响且不能继续拖延";
  if (candidate.priority === "p1") return english ? "Important current action" : "当前重要行动";
  return candidate.next_action
    ? (english ? `Clear next action: ${candidate.next_action}` : `下一步明确：${candidate.next_action}`)
    : (english ? "Fits the remaining capacity today" : "适合用今天剩余容量推进");
}

function candidateScore(candidate: Candidate, date: string, timezone: string): number {
  let score = 100 - priorityRank(candidate.priority) * 20;
  if (isDueOnOrBefore(candidate, date, timezone)) score += 80;
  if (isPlanned(candidate, date)) score += 40;
  if (candidate.next_action) score += 10;
  if (candidate.status === "waiting" || candidate.actor === "other") score -= 80;
  if (candidate.status === "someday") score -= 60;
  return score;
}

function fixedEvents(candidates: Candidate[], date: string, timezone: string): Candidate[] {
  return candidates
    .filter((candidate) => {
      if (candidate.kind !== "event" || !candidate.start_at) return false;
      const startDate = format(toZonedTime(parseISO(candidate.start_at), timezone), "yyyy-MM-dd");
      const endDate = candidate.end_at ? format(toZonedTime(parseISO(candidate.end_at), timezone), "yyyy-MM-dd") : startDate;
      return candidate.all_day ? startDate <= date && date < endDate : startDate <= date && date <= endDate;
    })
    .sort((left, right) => compareAsc(parseISO(left.start_at!), parseISO(right.start_at!)));
}

function usableActionMinutes(input: GenerateBriefInput, events: Candidate[]): number {
  const now = input.now ?? new Date();
  const start = zonedInstant(input.date, input.settings.work_start, input.settings.timezone);
  const end = zonedInstant(input.date, input.settings.work_end, input.settings.timezone);
  const effectiveStart = isBefore(start, now) ? now : start;
  if (!isBefore(effectiveStart, end)) return 0;
  const occupied = [
    { start: zonedInstant(input.date, input.settings.lunch_start, input.settings.timezone), end: zonedInstant(input.date, input.settings.lunch_end, input.settings.timezone) },
    ...events.flatMap((event) => event.start_at && event.end_at && !event.all_day ? [{ start: parseISO(event.start_at), end: parseISO(event.end_at) }] : [])
  ];
  const unavailable = occupied.reduce((total, interval) => {
    const clippedStart = interval.start < effectiveStart ? effectiveStart : interval.start;
    const clippedEnd = interval.end > end ? end : interval.end;
    return total + Math.max(0, (clippedEnd.getTime() - clippedStart.getTime()) / 60000);
  }, 0);
  const available = Math.max(0, (end.getTime() - effectiveStart.getTime()) / 60000 - unavailable);
  return Math.floor(available * (1 - input.settings.buffer_ratio));
}

function allocateBlocks(actions: DailyBrief["actions"], events: Candidate[], input: GenerateBriefInput): DailyBrief["time_blocks"] {
  const { date, settings } = input;
  const now = input.now ?? new Date();
  const workStart = zonedInstant(date, settings.work_start, settings.timezone);
  const workEnd = zonedInstant(date, settings.work_end, settings.timezone);
  const lunchStart = zonedInstant(date, settings.lunch_start, settings.timezone);
  const lunchEnd = zonedInstant(date, settings.lunch_end, settings.timezone);
  const cursorFloor = isBefore(workStart, now) ? now : workStart;

  const fixed = events.flatMap((event) => {
    if (!event.start_at || !event.end_at || event.all_day) return [];
    return [{
      block_id: `fixed:${event.candidate_id}`,
      title: event.title,
      start_at: event.start_at,
      end_at: event.end_at,
      kind: "fixed" as const,
      editable: false
    }];
  });

  const occupied = [
    ...fixed.map((block) => ({ start: parseISO(block.start_at), end: parseISO(block.end_at) })),
    { start: lunchStart, end: lunchEnd }
  ].sort((left, right) => compareAsc(left.start, right.start));

  const blocks: DailyBrief["time_blocks"] = [...fixed];
  let cursor = cursorFloor;

  for (const action of actions) {
    const duration = action.estimate_minutes;
    let start = cursor;
    let end = addMinutes(start, duration);

    for (const interval of occupied) {
      if (areIntervalsOverlapping({ start, end }, interval, { inclusive: false })) {
        start = interval.end;
        end = addMinutes(start, duration);
      }
    }
    if (isBefore(workEnd, end)) break;

    const kind = duration >= settings.deep_block_minutes ? "deep" : duration <= settings.admin_block_minutes ? "admin" : "focus";
    blocks.push({
      block_id: randomUUID(),
      action_id: action.action_id,
      title: action.title,
      start_at: iso(start),
      end_at: iso(end),
      kind,
      editable: true
    });
    occupied.push({ start, end });
    occupied.sort((left, right) => compareAsc(left.start, right.start));
    cursor = addMinutes(end, 10);
  }

  const scheduledMinutes = blocks.filter((block) => block.kind !== "fixed").reduce((total, block) => total + (parseISO(block.end_at).getTime() - parseISO(block.start_at).getTime()) / 60000, 0);
  const bufferMinutes = Math.round(scheduledMinutes * settings.buffer_ratio / (1 - settings.buffer_ratio));
  if (bufferMinutes >= 10) {
    const findBufferSlot = (initial: Date) => {
      let start = initial;
      for (let attempt = 0; attempt <= occupied.length; attempt += 1) {
        const end = addMinutes(start, bufferMinutes);
        const collision = occupied.find((interval) => areIntervalsOverlapping({ start, end }, interval, { inclusive: false }));
        if (!collision) return !isBefore(workEnd, end) ? { start, end } : undefined;
        start = collision.end;
      }
      return undefined;
    };
    const slot = findBufferSlot(cursor) ?? findBufferSlot(cursorFloor);
    if (slot && !isBefore(slot.start, now)) {
      blocks.push({
        block_id: randomUUID(),
        title: settings.language === "en" ? "Buffer and unexpected work" : "缓冲与临时事项",
        start_at: iso(slot.start),
        end_at: iso(slot.end),
        kind: "buffer",
        editable: true
      });
    }
  }

  return blocks.sort((left, right) => compareAsc(parseISO(left.start_at), parseISO(right.start_at)));
}

export function generateDailyBrief(input: GenerateBriefInput): DailyBrief {
  const all = deduplicateCandidates([
    ...flattenSnapshots(input.snapshots),
    ...(input.localCandidates ?? [])
  ]).filter((candidate) => candidate.status !== "done" && candidate.status !== "canceled");

  const events = fixedEvents(all, input.date, input.settings.timezone);
  const decisions = all.filter((candidate) => candidate.actor === "other" || candidate.status === "waiting");
  const actionable = all
    .filter((candidate) => candidate.kind !== "event" && candidate.actor !== "other" && candidate.status !== "waiting")
    .sort((left, right) => candidateScore(right, input.date, input.settings.timezone) - candidateScore(left, input.date, input.settings.timezone));

  const capacity = usableActionMinutes(input, events);
  const selected: Candidate[] = [];
  const capacityDeferred: Candidate[] = [];
  let plannedMinutes = 0;
  for (const item of actionable) {
    const estimate = item.estimate_minutes ?? input.settings.admin_block_minutes;
    const hardDeadline = isDueOnOrBefore(item, input.date, input.settings.timezone);
    if (selected.length < input.settings.max_actions && (plannedMinutes + estimate <= capacity || hardDeadline)) {
      selected.push(item);
      plannedMinutes += estimate;
    } else {
      capacityDeferred.push(item);
    }
  }
  const actions = selected.map((candidate) => ({
    action_id: candidate.candidate_id,
    title: candidate.next_action || candidate.title,
    priority: candidate.priority,
    estimate_minutes: candidate.estimate_minutes ?? input.settings.admin_block_minutes,
    reason: actionReason(candidate, input.date, input.settings.timezone, input.settings.language),
    source_id: candidate.source_id,
    ...(candidate.source_ref ? { source_ref: candidate.source_ref } : {}),
    ...(candidate.due_at ? { due_at: candidate.due_at } : {}),
    ...(candidate.project_id ? { project_id: candidate.project_id } : {})
  }));

  const failedSources = input.snapshots.filter((snapshot) => snapshot.status !== "ok");
  const sourceStatus = input.snapshots.map((snapshot) => ({
    source_id: snapshot.source_id,
    capability: snapshot.capability,
    status: snapshot.status,
    captured_at: snapshot.captured_at,
    item_count: snapshot.status === "ok" ? snapshot.items.length : null,
    ...(snapshot.failure_reason ? { failure_reason: snapshot.failure_reason } : {}),
    ...(snapshot.recovery_hint ? { recovery_hint: snapshot.recovery_hint } : {})
  }));

  const english = input.settings.language === "en";
  const judgment = actions.length === 0
    ? (english ? "No action can be confirmed automatically today. Add one real task to the inbox or repair a disconnected source." : "今天没有可自动确认的行动；先从收集箱加入一件真实任务，或修复未连接来源。")
    : plannedMinutes > capacity
      ? (english ? "Today's hard deadlines exceed the remaining capacity. Handle those first, then explicitly renegotiate or defer the rest." : "今天的硬截止已经超过剩余容量；先处理硬截止，并明确改约或延期其他事项。")
      : (english
        ? `Complete ${Math.min(actions.length, input.settings.primary_actions)} primary actions today and keep ${Math.round(input.settings.buffer_ratio * 100)}% as buffer.`
        : `今天先完成 ${Math.min(actions.length, input.settings.primary_actions)} 项主要行动，并保留 ${Math.round(input.settings.buffer_ratio * 100)}% 缓冲。`);

  const brief: DailyBrief = {
    schema_version: API_VERSION,
    brief_id: randomUUID(),
    date: input.date,
    timezone: input.settings.timezone,
    generated_at: (input.now ?? new Date()).toISOString(),
    judgment,
    fixed_events: events,
    actions,
    deferred: capacityDeferred,
    decisions,
    time_blocks: allocateBlocks(actions, events, input),
    source_status: sourceStatus,
    rationale: english ? [
      "Real deadlines and items already planned for today come first.",
      "External sources stay read-only; a local daily plan does not rewrite real due dates or plan dates.",
      "A failed source remains marked as failed and is never interpreted as zero items."
    ] : [
      "真实截止和已经计划今天的事项优先。",
      "外部来源只读；本地日计划不改写任务的真实截止或计划日。",
      "来源失败按失败状态展示，不解释为零事项。"
    ],
    degraded: failedSources.length > 0
  };
  return dailyBriefSchema.parse(brief);
}
