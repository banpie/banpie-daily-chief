import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";

export function ProjectsPage() {
  const { data, refresh } = useStore();
  const [title, setTitle] = useState("");
  if (!data) return null;
  const create = async () => { if (!title.trim()) return; await api.createProject({ title: title.trim(), status: "active" }); setTitle(""); await refresh(); };
  return <section><header className="page-header"><div><p className="eyebrow">项目必须有目标结果</p><h1>项目</h1></div></header><div className="quick-add"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新项目名称" /><button className="button primary" onClick={() => void create()}><Plus size={16} />新建</button></div><div className="project-grid">{data.projects.map((project) => <article className="panel project-card" key={project.project_id}><span className={`badge ${project.status}`}>{project.status}</span><h2>{project.title}</h2><p>{project.outcome || "还没有写目标结果"}</p><dl><dt>当前焦点</dt><dd>{project.current_focus || "未设置"}</dd><dt>下一步</dt><dd>{project.next_action || "未设置"}</dd><dt>开放任务</dt><dd>{data.tasks.filter((task) => task.project_id === project.project_id && !["done", "canceled"].includes(task.status)).length}</dd></dl></article>)}</div></section>;
}

