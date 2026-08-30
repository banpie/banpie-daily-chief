import { useState } from "react";
import { Save, X } from "lucide-react";
import { api } from "../api";
import { localize, type Language } from "../i18n";
import type { Project, Task } from "../types";

type EditableTask = {
  title: string;
  notes: string;
  status: Task["status"];
  project_id: string;
  due_at: string;
  plan_date: string;
  estimate_minutes: number;
  priority: Task["priority"];
  context: string;
  next_action: string;
  recurrence: "none" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
  recurrence_interval: number;
  recurrence_unit: "DAILY" | "WEEKLY" | "MONTHLY";
  recurrence_start_date: string;
};

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function recurrenceDraft(rrule?: string): Pick<EditableTask, "recurrence" | "recurrence_interval" | "recurrence_unit"> {
  if (!rrule) return { recurrence: "none", recurrence_interval: 1, recurrence_unit: "WEEKLY" };
  if (rrule === "FREQ=DAILY") return { recurrence: "daily", recurrence_interval: 1, recurrence_unit: "DAILY" };
  if (rrule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") return { recurrence: "weekdays", recurrence_interval: 1, recurrence_unit: "WEEKLY" };
  if (rrule === "FREQ=WEEKLY") return { recurrence: "weekly", recurrence_interval: 1, recurrence_unit: "WEEKLY" };
  if (rrule === "FREQ=MONTHLY") return { recurrence: "monthly", recurrence_interval: 1, recurrence_unit: "MONTHLY" };
  const interval = Number(rrule.match(/INTERVAL=(\d+)/)?.[1] ?? 1);
  const unit = (rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY)/)?.[1] ?? "WEEKLY") as EditableTask["recurrence_unit"];
  return { recurrence: "custom", recurrence_interval: interval, recurrence_unit: unit };
}

function ruleFromDraft(draft: EditableTask): string | null {
  if (draft.recurrence === "none") return null;
  if (draft.recurrence === "daily") return "FREQ=DAILY";
  if (draft.recurrence === "weekdays") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  if (draft.recurrence === "weekly") return "FREQ=WEEKLY";
  if (draft.recurrence === "monthly") return "FREQ=MONTHLY";
  return `FREQ=${draft.recurrence_unit};INTERVAL=${Math.max(1, draft.recurrence_interval)}`;
}

export function TaskEditor({ task, projects, language, onClose, onSaved }: { task?: Task; projects: Project[]; language: Language; onClose: () => void; onSaved: () => Promise<void> }) {
  const recurrence = recurrenceDraft(task?.recurrence_rrule);
  const [draft, setDraft] = useState<EditableTask>({
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? "inbox",
    project_id: task?.project_id ?? "",
    due_at: toLocalInput(task?.due_at),
    plan_date: task?.plan_date ?? "",
    estimate_minutes: task?.estimate_minutes ?? 30,
    priority: task?.priority ?? "p2",
    context: task?.context ?? "",
    next_action: task?.next_action ?? "",
    ...recurrence,
    recurrence_start_date: task?.recurrence_start_date ?? task?.plan_date ?? new Date().toISOString().slice(0, 10)
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = (chinese: string, english: string) => localize(language, chinese, english);

  const save = async () => {
    if (!draft.title.trim()) return setError(l("任务标题不能为空。", "Task title is required."));
    setSaving(true);
    setError(null);
    try {
      const rule = ruleFromDraft(draft);
      const input = {
        title: draft.title.trim(), notes: draft.notes, status: draft.status,
        project_id: draft.project_id || null,
        due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
        plan_date: draft.plan_date || null,
        estimate_minutes: draft.estimate_minutes, priority: draft.priority,
        context: draft.context || null, next_action: draft.next_action || null,
        recurrence_rrule: rule,
        recurrence_start_date: rule ? draft.recurrence_start_date : null
      };
      if (task) await api.updateTask(task.task_id, input);
      else await api.createTask({
        title: input.title, notes: input.notes, status: input.status,
        project_id: input.project_id, estimate_minutes: input.estimate_minutes, priority: input.priority,
        ...(input.due_at ? { due_at: input.due_at } : {}),
        ...(input.plan_date ? { plan_date: input.plan_date } : {}),
        ...(input.context ? { context: input.context } : {}),
        ...(input.next_action ? { next_action: input.next_action } : {}),
        ...(input.recurrence_rrule ? { recurrence_rrule: input.recurrence_rrule, recurrence_start_date: input.recurrence_start_date ?? undefined } : {})
      });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
      <header><div><p className="eyebrow">{l("本地任务可编辑", "Local tasks are editable")}</p><h2 id="task-editor-title">{task ? l("编辑任务", "Edit task") : l("新建任务", "New task")}</h2></div><button className="icon-button" aria-label={l("关闭", "Close")} onClick={onClose}><X /></button></header>
      <label>{l("标题", "Title")}<input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <div className="form-row">
        <label>{l("状态", "Status")}<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Task["status"] }))}><option value="inbox">{l("收集箱", "Inbox")}</option><option value="next">{l("下一步", "Next")}</option><option value="waiting">{l("等待中", "Waiting")}</option><option value="someday">{l("以后再说", "Someday")}</option><option value="done">{l("已完成", "Done")}</option><option value="canceled">{l("已取消", "Canceled")}</option></select></label>
        <label>{l("项目", "Project")}<select value={draft.project_id} onChange={(event) => setDraft((current) => ({ ...current, project_id: event.target.value }))}><option value="">{l("无项目", "No project")}</option>{projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.title}</option>)}</select></label>
        <label>{l("真实截止", "True deadline")}<input type="datetime-local" value={draft.due_at} onChange={(event) => setDraft((current) => ({ ...current, due_at: event.target.value }))} /></label>
        <label>{l("计划日", "Plan date")}<input type="date" value={draft.plan_date} onChange={(event) => setDraft((current) => ({ ...current, plan_date: event.target.value }))} /></label>
        <label>{l("预计时长（分钟）", "Estimate (minutes)")}<input type="number" min={5} max={720} step={5} value={draft.estimate_minutes} onChange={(event) => setDraft((current) => ({ ...current, estimate_minutes: Number(event.target.value) }))} /></label>
        <label>{l("优先级", "Priority")}<select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Task["priority"] }))}><option value="p0">P0 · {l("硬门槛", "Hard gate")}</option><option value="p1">P1 · {l("重要", "Important")}</option><option value="p2">P2 · {l("普通", "Normal")}</option><option value="p3">P3 · {l("可延后", "Deferrable")}</option></select></label>
        <label>{l("上下文", "Context")}<input value={draft.context} onChange={(event) => setDraft((current) => ({ ...current, context: event.target.value }))} placeholder={l("电脑 / 电话 / 外出", "Computer / Phone / Errand")} /></label>
        <label>{l("下一步", "Next action")}<input value={draft.next_action} onChange={(event) => setDraft((current) => ({ ...current, next_action: event.target.value }))} /></label>
      </div>
      <div className="form-row">
        <label>{l("重复", "Repeat")}<select value={draft.recurrence} onChange={(event) => setDraft((current) => ({ ...current, recurrence: event.target.value as EditableTask["recurrence"] }))}><option value="none">{l("不重复", "Does not repeat")}</option><option value="daily">{l("每天", "Daily")}</option><option value="weekdays">{l("工作日", "Weekdays")}</option><option value="weekly">{l("每周", "Weekly")}</option><option value="monthly">{l("每月", "Monthly")}</option><option value="custom">{l("自定义间隔", "Custom interval")}</option></select></label>
        {draft.recurrence !== "none" && <label>{l("系列开始日", "Series start date")}<input type="date" value={draft.recurrence_start_date} onChange={(event) => setDraft((current) => ({ ...current, recurrence_start_date: event.target.value }))} /></label>}
        {draft.recurrence === "custom" && <><label>{l("每隔", "Every")}<input type="number" min={1} max={99} value={draft.recurrence_interval} onChange={(event) => setDraft((current) => ({ ...current, recurrence_interval: Number(event.target.value) }))} /></label><label>{l("单位", "Unit")}<select value={draft.recurrence_unit} onChange={(event) => setDraft((current) => ({ ...current, recurrence_unit: event.target.value as EditableTask["recurrence_unit"] }))}><option value="DAILY">{l("天", "Days")}</option><option value="WEEKLY">{l("周", "Weeks")}</option><option value="MONTHLY">{l("月", "Months")}</option></select></label></>}
      </div>
      <label>{l("备注", "Notes")}<textarea rows={5} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="button ghost" onClick={onClose}>{l("取消", "Cancel")}</button><button className="button primary" disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? l("正在保存…", "Saving…") : l("保存任务", "Save task")}</button></footer>
    </section>
  </div>;
}
