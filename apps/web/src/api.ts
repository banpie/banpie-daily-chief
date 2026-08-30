import type { BootstrapData, DailyBrief, DailyPlan, OnboardingState, Project, Settings, Task } from "./types";

export type TaskUpdateInput = Partial<Omit<Task, "task_id" | "created_at" | "due_at" | "plan_date" | "recurrence_rrule" | "recurrence_start_date" | "context" | "next_action">> & {
  due_at?: string | null;
  plan_date?: string | null;
  recurrence_rrule?: string | null;
  recurrence_start_date?: string | null;
  context?: string | null;
  next_action?: string | null;
};

const queryToken = new URLSearchParams(window.location.search).get("token");
if (queryToken) {
  window.sessionStorage.setItem("daily-chief-token", queryToken);
  window.history.replaceState({}, "", window.location.pathname);
}

const token = () => window.sessionStorage.getItem("daily-chief-token") ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body as T;
}

export const api = {
  bootstrap: () => request<BootstrapData>("/api/bootstrap"),
  createTask: (input: Partial<Task> & Pick<Task, "title">) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  updateTask: (taskId: string, input: TaskUpdateInput) => request<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) }),
  completeTask: (taskId: string, occurrenceDate?: string) => request<Task>(`/api/tasks/${taskId}/complete`, { method: "POST", body: JSON.stringify(occurrenceDate ? { occurrence_date: occurrenceDate } : {}) }),
  reopenTask: (taskId: string, occurrenceDate?: string) => request<Task>(`/api/tasks/${taskId}/reopen`, { method: "POST", body: JSON.stringify(occurrenceDate ? { occurrence_date: occurrenceDate } : {}) }),
  createProject: (input: Partial<Project> & Pick<Project, "title">) => request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  updateProject: (projectId: string, input: Partial<Project>) => request<Project>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(input) }),
  updateSettings: (input: Partial<Settings>) => request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(input) }),
  generate: (date?: string) => request<DailyBrief>("/api/generate", { method: "POST", body: JSON.stringify(date ? { date } : {}) }),
  updateOnboarding: (input: Partial<OnboardingState>) => request<OnboardingState>("/api/onboarding", { method: "PATCH", body: JSON.stringify(input) }),
  previewOnboarding: (tasks: OnboardingState["draft_tasks"]) => request<{ onboarding: OnboardingState; brief: DailyBrief; plan: DailyPlan }>("/api/onboarding/preview", { method: "POST", body: JSON.stringify({ tasks }) }),
  importFile: (input: { filename: string; content: string; source_id: string }) => request("/api/import", { method: "POST", body: JSON.stringify(input) }),
  updatePlan: (date: string, input: Partial<DailyPlan>) => request<DailyPlan>(`/api/plans/${date}`, { method: "PATCH", body: JSON.stringify(input) }),
  cleanup: () => request<{ snapshots: number; briefs: number }>("/api/cleanup", { method: "POST" })
};
