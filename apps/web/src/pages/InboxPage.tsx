import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { api } from "../api";
import { localize } from "../i18n";
import { useStore } from "../store";

export function InboxPage() {
  const { data, refresh } = useStore();
  const [title, setTitle] = useState("");
  if (!data) return null;
  const l = (chinese: string, english: string) => localize(data.settings.language, chinese, english);
  const inbox = data.tasks.filter((task) => task.status === "inbox");
  const add = async () => { if (!title.trim()) return; await api.createTask({ title: title.trim(), status: "inbox", estimate_minutes: 30, priority: "p2" }); setTitle(""); await refresh(); };
  const plan = async (taskId: string) => { await api.updateTask(taskId, { status: "next", plan_date: new Date().toISOString().slice(0, 10) }); await refresh(); };
  return <section><header className="page-header"><div><p className="eyebrow">{l("先收集，再判断", "Capture first, decide later")}</p><h1>{l("收集箱", "Inbox")}</h1></div></header><div className="quick-add"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} placeholder={l("记下一件需要推进的事…", "Capture something that needs to move forward…")} /><button className="button primary" onClick={() => void add()}><Plus size={16} />{l("加入", "Add")}</button></div><article className="panel list-panel">{inbox.length === 0 ? <div className="empty-state compact"><h2>{l("收集箱是空的", "Your inbox is empty")}</h2><p>{l("这不是目标；只有真实需要处理的事才放进来。", "An empty inbox is not the goal. Add only things that truly need attention.")}</p></div> : inbox.map((task) => <div className="task-row" key={task.task_id}><div><strong>{task.title}</strong><p>{task.estimate_minutes} {l("分钟", "min")} · {task.priority.toUpperCase()}</p></div><button className="button ghost" onClick={() => void plan(task.task_id)}>{l("安排今天", "Plan for today")} <ArrowRight size={15} /></button></div>)}</article></section>;
}
