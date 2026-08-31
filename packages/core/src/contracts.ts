import { z } from "zod";

export const API_VERSION = "1.0" as const;
export const CORE_VERSION = "1.0.2" as const;

export const capabilitySchema = z.enum([
  "calendar.read",
  "tasks.read",
  "mail.read",
  "notes.read",
  "signals.read",
  "notification.send",
  "schedule.create",
  "local.tasks.write"
]);

export const sourceStatusSchema = z.enum([
  "ok",
  "not_connected",
  "login_required",
  "read_failed",
  "stale",
  "not_read"
]);

export const taskStatusSchema = z.enum([
  "inbox",
  "next",
  "waiting",
  "someday",
  "done",
  "canceled"
]);

export const projectStatusSchema = z.enum(["active", "paused", "done", "canceled"]);
export const candidateKindSchema = z.enum(["event", "task", "mail", "signal"]);
export const prioritySchema = z.enum(["p0", "p1", "p2", "p3"]);
export const deviceEcosystemSchema = z.enum(["iphone_mac", "iphone_no_mac", "android_google", "other"]);

const optionalIso = z.iso.datetime({ offset: true }).optional();

export const candidateSchema = z.object({
  candidate_id: z.string().min(1),
  kind: candidateKindSchema,
  title: z.string().trim().min(1).max(300),
  source_id: z.string().min(1),
  source_ref: z.string().optional(),
  external_id: z.string().optional(),
  url: z.url().optional(),
  start_at: optionalIso,
  end_at: optionalIso,
  due_at: optionalIso,
  plan_date: z.iso.date().optional(),
  actor: z.enum(["self", "other", "unknown"]).default("self"),
  estimate_minutes: z.number().int().min(5).max(720).optional(),
  next_action: z.string().max(500).optional(),
  risk: z.string().max(500).optional(),
  project_id: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.default("p2"),
  all_day: z.boolean().default(false),
  notes: z.string().max(5000).optional()
});

export const sourceSnapshotSchema = z.object({
  schema_version: z.literal(API_VERSION),
  snapshot_id: z.string().min(1),
  source_id: z.string().min(1),
  capability: capabilitySchema,
  captured_at: z.iso.datetime({ offset: true }),
  timezone: z.string().min(1),
  status: sourceStatusSchema,
  expires_at: optionalIso,
  failure_reason: z.string().max(1000).optional(),
  recovery_hint: z.string().max(1000).optional(),
  items: z.array(candidateSchema).default([])
}).superRefine((value, context) => {
  if (value.status !== "ok" && value.items.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "A failed or unavailable source cannot claim fresh items. Use status=stale for an explicitly stale cache."
    });
  }
});

export const taskSchema = z.object({
  task_id: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(10000).default(""),
  status: taskStatusSchema.default("inbox"),
  project_id: z.string().nullable().default(null),
  due_at: optionalIso,
  plan_date: z.iso.date().optional(),
  estimate_minutes: z.number().int().min(5).max(720).default(30),
  priority: prioritySchema.default("p2"),
  recurrence_rrule: z.string().optional(),
  recurrence_start_date: z.iso.date().optional(),
  context: z.string().max(120).optional(),
  next_action: z.string().max(500).optional(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  completed_at: optionalIso
});

export const projectSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  outcome: z.string().max(1000).default(""),
  status: projectStatusSchema.default("active"),
  current_focus: z.string().max(1000).default(""),
  next_action: z.string().max(500).default(""),
  notes: z.string().max(10000).default(""),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true })
});

export const sourceStateViewSchema = z.object({
  source_id: z.string(),
  capability: capabilitySchema,
  status: sourceStatusSchema,
  captured_at: z.iso.datetime({ offset: true }),
  item_count: z.number().int().nonnegative().nullable(),
  failure_reason: z.string().optional(),
  recovery_hint: z.string().optional()
});

export const dailyActionSchema = z.object({
  action_id: z.string().min(1),
  title: z.string().min(1),
  priority: prioritySchema,
  estimate_minutes: z.number().int().positive(),
  reason: z.string().min(1),
  source_id: z.string(),
  source_ref: z.string().optional(),
  due_at: optionalIso,
  project_id: z.string().optional()
});

export const timeBlockSchema = z.object({
  block_id: z.string().min(1),
  action_id: z.string().optional(),
  title: z.string().min(1),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
  kind: z.enum(["fixed", "deep", "focus", "admin", "buffer"]),
  editable: z.boolean().default(true)
});

export const dailyBriefSchema = z.object({
  schema_version: z.literal(API_VERSION),
  brief_id: z.string().min(1),
  date: z.iso.date(),
  timezone: z.string().min(1),
  generated_at: z.iso.datetime({ offset: true }),
  judgment: z.string().min(1),
  fixed_events: z.array(candidateSchema),
  actions: z.array(dailyActionSchema).max(5),
  deferred: z.array(candidateSchema),
  decisions: z.array(candidateSchema),
  time_blocks: z.array(timeBlockSchema),
  source_status: z.array(sourceStateViewSchema),
  rationale: z.array(z.string()).default([]),
  degraded: z.boolean().default(false)
});

export const dailyPlanSchema = z.object({
  schema_version: z.literal(API_VERSION),
  plan_id: z.string().min(1),
  date: z.iso.date(),
  brief_id: z.string().min(1),
  accepted: z.boolean().default(false),
  adjusted: z.boolean().default(false),
  action_order: z.array(z.string().min(1)).max(5),
  time_blocks: z.array(timeBlockSchema),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true })
});

export const onboardingDraftTaskSchema = z.object({
  draft_id: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  estimate_minutes: z.number().int().min(5).max(720).default(30),
  priority: prioritySchema.default("p2")
});

export const onboardingStateSchema = z.object({
  schema_version: z.literal(API_VERSION),
  current_step: z.number().int().min(1).max(7).default(1),
  device_ecosystem: deviceEcosystemSchema.default("other"),
  selected_sources: z.array(z.string().min(1)).default(["local.tasks"]),
  draft_tasks: z.array(onboardingDraftTaskSchema).max(10).default([]),
  seed_task_ids: z.array(z.string().min(1)).max(10).default([]),
  preview_brief_id: z.string().optional(),
  completed_at: optionalIso,
  updated_at: z.iso.datetime({ offset: true })
});

export const adapterReportSchema = z.object({
  adapter_id: z.string().min(1),
  api_version: z.literal(API_VERSION),
  capabilities: z.array(capabilitySchema),
  host: z.string().min(1),
  operating_system: z.string().min(1),
  provider: z.string().min(1),
  available: z.boolean(),
  needs_login: z.boolean().default(false),
  read_only: z.boolean().default(true),
  last_success_at: optionalIso,
  failure_reason: z.string().optional(),
  recovery_hint: z.string().optional()
});

export const capabilityReportSchema = z.object({
  schema_version: z.literal(API_VERSION),
  checked_at: z.iso.datetime({ offset: true }),
  agent_host: z.string().min(1),
  operating_system: z.string().min(1),
  node_version: z.string().min(1),
  scheduler_available: z.boolean(),
  notification_available: z.boolean(),
  adapters: z.array(adapterReportSchema),
  local_database: z.object({
    available: z.boolean(),
    path: z.string(),
    writable: z.boolean(),
    error: z.string().optional()
  })
});

export const settingsSchema = z.object({
  language: z.enum(["zh-CN", "en"]).default("zh-CN"),
  timezone: z.string().default("Asia/Shanghai"),
  wake_time: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
  sleep_time: z.string().regex(/^\d{2}:\d{2}$/).default("23:00"),
  work_start: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  work_end: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  lunch_start: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  lunch_end: z.string().regex(/^\d{2}:\d{2}$/).default("13:30"),
  primary_actions: z.number().int().min(1).max(5).default(3),
  max_actions: z.number().int().min(1).max(5).default(5),
  deep_block_minutes: z.number().int().min(30).max(180).default(90),
  focus_block_minutes: z.number().int().min(20).max(120).default(60),
  admin_block_minutes: z.number().int().min(10).max(60).default(30),
  buffer_ratio: z.number().min(0.1).max(0.5).default(0.2),
  snapshot_retention_days: z.number().int().min(1).max(90).default(7),
  brief_retention_days: z.number().int().min(7).max(3650).default(90),
  onboarding_completed: z.boolean().default(false)
});

export type Capability = z.infer<typeof capabilitySchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Project = z.infer<typeof projectSchema>;
export type DailyBrief = z.infer<typeof dailyBriefSchema>;
export type DailyPlan = z.infer<typeof dailyPlanSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type CapabilityReport = z.infer<typeof capabilityReportSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = settingsSchema.parse({});

export const defaultOnboardingState: OnboardingState = onboardingStateSchema.parse({
  schema_version: API_VERSION,
  updated_at: new Date(0).toISOString()
});
