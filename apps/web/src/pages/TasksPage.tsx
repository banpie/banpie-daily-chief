import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Pencil, Plus, RotateCcw, Search, XCircle } from "lucide-react";
import { api } from "../api";
import { TaskEditor } from "../components/TaskEditor";
import { localize } from "../i18n";
import { useStore } from "../store";
import type { Task } from "../types";

function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function TasksPage() {
  const { data, refresh } = useStore();
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const tasks = useMemo(() => data?.tasks.filter((task) => {
    const statusMatch = filter === "all" || (filter === "open" ? !["done", "canceled"].includes(task.status) : task.status === filter);
    const text = `${task.title} ${task.notes} ${task.next_action ?? ""} ${task.context ?? ""}`.toLocaleLowerCase();
    return statusMatch && text.includes(query.trim().toLocaleLowerCase());
  }) ?? [], [data?.tasks, filter, query]);
  if (!data) return null;
  const l = (chinese: string, english: string) => localize(data.settings.language, chinese, english);
  const today = dateInTimezone(data.settings.timezone);
  const recurringOccurrences = new Set(data.recurring_occurrences_today);
  const completedOccurrences = new Set(data.completed_occurrences_today);

  const toggleComplete = async (task: Task) => {
    if (task.recurrence_rrule && !recurringOccurrences.has(task.task_id)) return;
    if (task.status === "done") await api.reopenTask(task.task_id);
    else if (task.recurrence_rrule && completedOccurrences.has(task.task_id)) await api.reopenTask(task.task_id, today);
    else await api.completeTask(task.task_id, task.recurrence_rrule ? today : undefined);
    await refresh();
  };

  return <section>
    <header className="page-header"><div><p className="eyebrow">{l("真实截止和计划日分开", "True deadlines stay separate from plan dates")}</p><h1>{l("任务", "Tasks")}</h1></div><button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />{l("新建任务", "New task")}</button></header>
    <div className="task-toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={l("搜索标题、备注、上下文", "Search title, notes, or context")} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">{l("开放任务", "Open tasks")}</option><option value="inbox">{l("收集箱", "Inbox")}</option><option value="next">{l("下一步", "Next")}</option><option value="waiting">{l("等待中", "Waiting")}</option><option value="someday">{l("以后再说", "Someday")}</option><option value="done">{l("已完成", "Done")}</option><option value="canceled">{l("已取消", "Canceled")}</option><option value="all">{l("全部", "All")}</option></select></div>
    <article className="panel list-panel">{tasks.length === 0 ? <div className="empty-state compact"><p>{l("没有匹配的任务。", "No matching tasks.")}</p></div> : tasks.map((task) => <div className="task-row" key={task.task_id}>
      <button className="icon-button" disabled={Boolean(task.recurrence_rrule && !recurringOccurrences.has(task.task_id))} aria-label={task.status === "done" ? l("恢复任务", "Reopen task") : task.recurrence_rrule && !recurringOccurrences.has(task.task_id) ? l("今天没有重复实例", "No recurring occurrence today") : task.recurrence_rrule && completedOccurrences.has(task.task_id) ? l("恢复今天这次", "Reopen today's occurrence") : task.recurrence_rrule ? l("完成今天这次", "Complete today's occurrence") : l("标记完成", "Mark done")} onClick={() => void toggleComplete(task)}>{task.status === "done" || completedOccurrences.has(task.task_id) ? <CheckCircle2 /> : <Circle />}</button>
      <button className="task-main grow" onClick={() => setEditing(task)}><strong className={task.status === "done" ? "done" : ""}>{task.title}</strong><p>{task.plan_date ? `${l("计划", "Planned")} ${task.plan_date}` : l("未安排", "Unscheduled")}{task.due_at ? ` · ${l("截止", "Due")} ${new Date(task.due_at).toLocaleString(data.settings.language)}` : ""} · {task.estimate_minutes} {l("分钟", "min")}{task.recurrence_rrule ? ` · ${l("重复系列", "Recurring series")}` : ""}</p>{task.next_action && <small>{l("下一步", "Next action")}: {task.next_action}</small>}</button>
      <span className={`badge ${task.priority}`}>{task.priority.toUpperCase()}</span>
      <button className="icon-button" aria-label={l("编辑任务", "Edit task")} onClick={() => setEditing(task)}><Pencil size={17} /></button>
      {task.status === "canceled" ? <button className="icon-button" aria-label={l("恢复任务", "Reopen task")} onClick={() => void api.updateTask(task.task_id, { status: "next" }).then(refresh)}><RotateCcw size={17} /></button> : <button className="icon-button" aria-label={l("取消任务或系列", "Cancel task or series")} onClick={() => void api.updateTask(task.task_id, { status: "canceled" }).then(refresh)}><XCircle size={17} /></button>}
    </div>)}</article>
    {editing && <TaskEditor key={editing === "new" ? "new" : editing.task_id} task={editing === "new" ? undefined : editing} projects={data.projects} language={data.settings.language} onClose={() => setEditing(null)} onSaved={refresh} />}
  </section>;
}
