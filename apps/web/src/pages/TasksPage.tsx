import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";

export function TasksPage() {
  const { data, refresh } = useStore();
  const [filter, setFilter] = useState("open");
  const tasks = useMemo(() => data?.tasks.filter((task) => filter === "all" || (filter === "open" ? !["done", "canceled"].includes(task.status) : task.status === filter)) ?? [], [data?.tasks, filter]);
  if (!data) return null;
  return <section><header className="page-header"><div><p className="eyebrow">真实截止和计划日分开</p><h1>任务</h1></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">开放任务</option><option value="inbox">收集箱</option><option value="next">下一步</option><option value="waiting">等待中</option><option value="someday">以后再说</option><option value="done">已完成</option><option value="all">全部</option></select></header><article className="panel list-panel">{tasks.map((task) => <div className="task-row" key={task.task_id}><button className="icon-button" aria-label={task.status === "done" ? "标记未完成" : "标记完成"} onClick={() => void api.updateTask(task.task_id, { status: task.status === "done" ? "next" : "done" }).then(refresh)}>{task.status === "done" ? <CheckCircle2 /> : <Circle />}</button><div className="grow"><strong className={task.status === "done" ? "done" : ""}>{task.title}</strong><p>{task.plan_date ? `计划 ${task.plan_date}` : "未安排"}{task.due_at ? ` · 截止 ${task.due_at.slice(0, 10)}` : ""} · {task.estimate_minutes} 分钟</p></div><span className={`badge ${task.priority}`}>{task.priority.toUpperCase()}</span></div>)}</article></section>;
}

