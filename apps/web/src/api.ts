import type { BootstrapData, DailyBrief, Project, Settings, Task } from "./types";

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
  updateTask: (taskId: string, input: Partial<Task>) => request<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) }),
  createProject: (input: Partial<Project> & Pick<Project, "title">) => request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  updateSettings: (input: Partial<Settings>) => request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(input) }),
  generate: (date?: string) => request<DailyBrief>("/api/generate", { method: "POST", body: JSON.stringify(date ? { date } : {}) }),
  cleanup: () => request<{ snapshots: number; briefs: number }>("/api/cleanup", { method: "POST" })
};

