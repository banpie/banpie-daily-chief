import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ProjectEditor } from "../components/ProjectEditor";
import { localize } from "../i18n";
import { useStore } from "../store";
import type { Project } from "../types";

export function ProjectsPage() {
  const { data, refresh } = useStore();
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  if (!data) return null;
  const l = (chinese: string, english: string) => localize(data.settings.language, chinese, english);

  return <section>
    <header className="page-header"><div><p className="eyebrow">{l("项目必须有目标结果", "Every project needs an outcome")}</p><h1>{l("项目", "Projects")}</h1></div><button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />{l("新建项目", "New project")}</button></header>
    <div className="project-grid">{data.projects.length === 0 ? <div className="panel empty-state compact"><p>{l("还没有项目。单独任务不必强行归入项目。", "No projects yet. A standalone task does not need to be forced into one.")}</p></div> : data.projects.map((project) => <article className="panel project-card" key={project.project_id}>
      <div className="project-card-head"><span className={`badge ${project.status}`}>{project.status}</span><button className="icon-button" aria-label={l("编辑项目", "Edit project")} onClick={() => setEditing(project)}><Pencil size={17} /></button></div>
      <h2>{project.title}</h2><p>{project.outcome || l("还没有写目标结果", "No outcome yet")}</p>
      <dl><dt>{l("当前焦点", "Current focus")}</dt><dd>{project.current_focus || l("未设置", "Not set")}</dd><dt>{l("下一步", "Next action")}</dt><dd>{project.next_action || l("未设置", "Not set")}</dd><dt>{l("开放任务", "Open tasks")}</dt><dd>{data.tasks.filter((task) => task.project_id === project.project_id && !["done", "canceled"].includes(task.status)).length}</dd></dl>
      {project.notes && <p className="project-notes">{project.notes}</p>}
    </article>)}</div>
    {editing && <ProjectEditor key={editing === "new" ? "new" : editing.project_id} project={editing === "new" ? undefined : editing} language={data.settings.language} onClose={() => setEditing(null)} onSaved={refresh} />}
  </section>;
}
