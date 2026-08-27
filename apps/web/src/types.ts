import type { DailyBrief, Project, Settings, SourceSnapshot, Task } from "@banpie/daily-chief-core";

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
  projects: Project[];
  snapshots: SourceSnapshot[];
  brief: DailyBrief | null;
  runs: RunLog[];
}

export type { DailyBrief, Project, Settings, SourceSnapshot, Task };

