import { isBefore, parseISO } from "date-fns";
import { dailyBriefSchema, dailyPlanSchema, type DailyBrief, type DailyPlan, type SourceSnapshot } from "./contracts.js";

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateDailyBrief(input: unknown, snapshots: SourceSnapshot[] = [], _now = new Date()): ValidationResult {
  const parsed = dailyBriefSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema_invalid",
        message: issue.message,
        path: issue.path.join("."),
        severity: "error"
      }))
    };
  }

  const brief = parsed.data;
  const issues: ValidationIssue[] = [];
  if (brief.actions.length > 5) {
    issues.push({ code: "too_many_actions", message: "本人行动超过硬上限 5 项。", path: "actions", severity: "error" });
  }

  const sorted = [...brief.time_blocks].sort((left, right) => parseISO(left.start_at).getTime() - parseISO(right.start_at).getTime());
  const planningNow = parseISO(brief.generated_at);
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: brief.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(planningNow);
  sorted.forEach((block, index) => {
    const start = parseISO(block.start_at);
    const end = parseISO(block.end_at);
    if (!isBefore(start, end)) issues.push({ code: "invalid_block", message: `时间块“${block.title}”结束时间不晚于开始时间。`, path: `time_blocks.${index}`, severity: "error" });
    if (brief.date === currentDate && isBefore(start, planningNow) && block.kind !== "fixed") {
      issues.push({ code: "past_block", message: `时间块“${block.title}”被安排在过去。`, path: `time_blocks.${index}`, severity: "error" });
    }
    const next = sorted[index + 1];
    if (next && isBefore(parseISO(next.start_at), end)) {
      const fixedOnly = block.kind === "fixed" && next.kind === "fixed";
      issues.push({ code: fixedOnly ? "fixed_overlap" : "overlap", message: `时间块“${block.title}”与“${next.title}”重叠。`, path: `time_blocks.${index}`, severity: fixedOnly ? "warning" : "error" });
    }
  });

  const actionIds = new Set(brief.actions.map((action) => action.action_id));
  const hardDeadlines = snapshots.flatMap((snapshot) => snapshot.status === "ok" ? snapshot.items : [])
    .filter((candidate) => candidate.actor !== "other" && candidate.status !== "done" && candidate.status !== "canceled" && candidate.due_at && candidate.due_at.slice(0, 10) <= brief.date);
  for (const deadline of hardDeadlines) {
    if (!actionIds.has(deadline.candidate_id) && !brief.deferred.some((item) => item.candidate_id === deadline.candidate_id)) {
      issues.push({ code: "hard_deadline_omitted", message: `硬截止事项“${deadline.title}”既未安排也未延期说明。`, severity: "error" });
    }
  }

  const statusMap = new Map(brief.source_status.map((source) => [source.source_id, source]));
  for (const snapshot of snapshots) {
    const status = statusMap.get(snapshot.source_id);
    if (!status) {
      issues.push({ code: "source_status_omitted", message: `缺少来源“${snapshot.source_id}”的状态。`, severity: "error" });
      continue;
    }
    if (snapshot.status !== "ok" && status.item_count === 0) {
      issues.push({ code: "false_zero", message: `来源“${snapshot.source_id}”读取失败却被表示为零事项。`, severity: "error" });
    }
  }

  const uniqueRefs = new Set<string>();
  for (const action of brief.actions) {
    const key = action.source_ref ?? `${action.source_id}:${action.title}`;
    if (uniqueRefs.has(key)) issues.push({ code: "duplicate_action", message: `行动“${action.title}”与其他入口重复。`, severity: "error" });
    uniqueRefs.add(key);
  }

  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}

export function assertValidDailyBrief(input: unknown, snapshots: SourceSnapshot[] = [], now = new Date()): DailyBrief {
  const result = validateDailyBrief(input, snapshots, now);
  if (!result.valid) throw new Error(result.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("\n"));
  return dailyBriefSchema.parse(input);
}

export function validateDailyPlan(input: unknown, brief: DailyBrief, now = new Date()): ValidationResult {
  const parsed = dailyPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, issues: parsed.error.issues.map((issue) => ({ code: "schema_invalid", message: issue.message, path: issue.path.join("."), severity: "error" })) };
  }
  const plan = parsed.data;
  const issues: ValidationIssue[] = [];
  if (plan.brief_id !== brief.brief_id || plan.date !== brief.date) {
    issues.push({ code: "brief_mismatch", message: "日计划与当前简报不匹配。", severity: "error" });
  }
  const expectedActions = new Set(brief.actions.map((action) => action.action_id));
  if (plan.action_order.length !== expectedActions.size || new Set(plan.action_order).size !== plan.action_order.length || plan.action_order.some((id) => !expectedActions.has(id))) {
    issues.push({ code: "action_order_invalid", message: "日计划必须且只能排列当前简报中的行动。", path: "action_order", severity: "error" });
  }
  const originalFixed = new Map(brief.time_blocks.filter((block) => block.kind === "fixed").map((block) => [block.block_id, block]));
  for (const [id, block] of originalFixed) {
    const current = plan.time_blocks.find((item) => item.block_id === id);
    if (!current || current.start_at !== block.start_at || current.end_at !== block.end_at || current.title !== block.title) {
      issues.push({ code: "fixed_block_changed", message: `固定事件“${block.title}”不可在本地日计划中改写。`, severity: "error" });
    }
  }
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: brief.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const currentDate = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
  const sorted = [...plan.time_blocks].sort((left, right) => parseISO(left.start_at).getTime() - parseISO(right.start_at).getTime());
  sorted.forEach((block, index) => {
    const start = parseISO(block.start_at);
    const end = parseISO(block.end_at);
    if (!isBefore(start, end)) issues.push({ code: "invalid_block", message: `时间块“${block.title}”结束时间不晚于开始时间。`, severity: "error" });
    if (block.editable && isBefore(start, now) && brief.date === currentDate) {
      issues.push({ code: "past_block", message: `时间块“${block.title}”不能移动到过去。`, severity: "error" });
    }
    const next = sorted[index + 1];
    if (next && isBefore(parseISO(next.start_at), end) && !(block.kind === "fixed" && next.kind === "fixed")) {
      issues.push({ code: "overlap", message: `时间块“${block.title}”与“${next.title}”重叠。`, severity: "error" });
    }
  });
  const minutes = (blocks: DailyPlan["time_blocks"], kind: "buffer") => blocks.filter((block) => block.kind === kind).reduce((total, block) => total + (parseISO(block.end_at).getTime() - parseISO(block.start_at).getTime()) / 60000, 0);
  if (minutes(plan.time_blocks, "buffer") < minutes(brief.time_blocks, "buffer")) {
    issues.push({ code: "buffer_reduced", message: "人工调整不能减少系统预留的缓冲时间。", severity: "error" });
  }
  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}
