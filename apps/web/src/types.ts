import type { CapabilityReport, DailyBrief, DailyPlan, OnboardingState, Project, Settings, SourceSnapshot, Task } from "@banpie/daily-chief-core";

export interface RunLog {
  run_id: string;
  started_at: string;
  finished_at: string;
  status: "success" | "degraded" | "failed";
  duration_ms: number;
  missing_sources: string[];
  error?: string;
  brief_id?: string;
}

export interface BootstrapData {
  settings: Settings;
  tasks: Task[];
  recurring_occurrences_today: string[];
  completed_occurrences_today: string[];
  projects: Project[];
  snapshots: SourceSnapshot[];
  brief: DailyBrief | null;
  plan: DailyPlan | null;
  onboarding: OnboardingState;
  doctor: CapabilityReport;
  runs: RunLog[];
}

export type { CapabilityReport, DailyBrief, DailyPlan, OnboardingState, Project, Settings, SourceSnapshot, Task };
