import { useState } from "react";
import { Save, X } from "lucide-react";
import { api } from "../api";
import { localize, type Language } from "../i18n";
import type { Project } from "../types";

export function ProjectEditor({ project, language, onClose, onSaved }: { project?: Project; language: Language; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({
    title: project?.title ?? "",
    outcome: project?.outcome ?? "",
    status: project?.status ?? "active" as Project["status"],
    current_focus: project?.current_focus ?? "",
    next_action: project?.next_action ?? "",
    notes: project?.notes ?? ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = (chinese: string, english: string) => localize(language, chinese, english);

  const save = async () => {
    if (!draft.title.trim()) return setError(l("项目名称不能为空。", "Project name is required."));
    setSaving(true);
    setError(null);
    try {
      if (project) await api.updateProject(project.project_id, { ...draft, title: draft.title.trim() });
      else await api.createProject({ ...draft, title: draft.title.trim() });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setSaving(false); }
  };

  return <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
      <header><div><p className="eyebrow">{l("个人项目", "Personal project")}</p><h2 id="project-editor-title">{project ? l("编辑项目", "Edit project") : l("新建项目", "New project")}</h2></div><button className="icon-button" aria-label={l("关闭", "Close")} onClick={onClose}><X /></button></header>
      <label>{l("项目名称", "Project name")}<input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label>{l("目标结果", "Outcome")}<textarea rows={3} value={draft.outcome} onChange={(event) => setDraft((current) => ({ ...current, outcome: event.target.value }))} placeholder={l("完成时能验证的结果", "A verifiable result when this is done")} /></label>
      <div className="form-row"><label>{l("状态", "Status")}<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Project["status"] }))}><option value="active">{l("进行中", "Active")}</option><option value="paused">{l("已暂停", "Paused")}</option><option value="done">{l("已完成", "Done")}</option><option value="canceled">{l("已取消", "Canceled")}</option></select></label><label>{l("当前焦点", "Current focus")}<input value={draft.current_focus} onChange={(event) => setDraft((current) => ({ ...current, current_focus: event.target.value }))} /></label></div>
      <label>{l("下一步", "Next action")}<input value={draft.next_action} onChange={(event) => setDraft((current) => ({ ...current, next_action: event.target.value }))} /></label>
      <label>{l("备注", "Notes")}<textarea rows={5} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="button ghost" onClick={onClose}>{l("取消", "Cancel")}</button><button className="button primary" disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? l("正在保存…", "Saving…") : l("保存项目", "Save project")}</button></footer>
    </section>
  </div>;
}
