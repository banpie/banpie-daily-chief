import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { api } from "../api";
import { localize } from "../i18n";
import { useStore } from "../store";
import type { Settings } from "../types";

export function SettingsPage() {
  const { data, refresh } = useStore();
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Settings | null>(() => data?.settings ?? null);
  if (!data || !draft) return null;
  const l = (chinese: string, english: string) => localize(draft.language, chinese, english);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const save = async () => {
    await api.updateSettings(draft);
    setMessage(l("设置已保存", "Settings saved"));
    await refresh();
  };
  const cleanup = async () => {
    const result = await api.cleanup();
    setMessage(l(`已清理 ${result.snapshots} 份过期快照和 ${result.briefs} 份过期简报`, `Removed ${result.snapshots} expired snapshots and ${result.briefs} expired briefs`));
  };

  return <section>
    <header className="page-header"><div><p className="eyebrow">{l("少量默认，随时可改", "A few calm defaults, editable anytime")}</p><h1>{l("设置", "Settings")}</h1></div><button className="button primary" onClick={() => void save()}><Save size={16} />{l("保存", "Save")}</button></header>
    {message && <div className="toast">{message}</div>}
    <div className="settings-grid">
      <article className="panel form-panel">
        <h2>{l("基本设置", "Basics")}</h2>
        <label>{l("语言", "Language")}<select value={draft.language} onChange={(event) => update("language", event.target.value as Settings["language"])}><option value="zh-CN">中文</option><option value="en">English</option></select></label>
        <label>{l("时区", "Time zone")}<input value={draft.timezone} onChange={(event) => update("timezone", event.target.value)} /></label>
        <div className="form-row"><label>{l("工作开始", "Work starts")}<input type="time" value={draft.work_start} onChange={(event) => update("work_start", event.target.value)} /></label><label>{l("工作结束", "Work ends")}<input type="time" value={draft.work_end} onChange={(event) => update("work_end", event.target.value)} /></label></div>
        <div className="form-row"><label>{l("午休开始", "Lunch starts")}<input type="time" value={draft.lunch_start} onChange={(event) => update("lunch_start", event.target.value)} /></label><label>{l("午休结束", "Lunch ends")}<input type="time" value={draft.lunch_end} onChange={(event) => update("lunch_end", event.target.value)} /></label></div>
      </article>
      <article className="panel form-panel">
        <h2>{l("容量与保留", "Capacity and retention")}</h2>
        <label>{l("主要行动数", "Primary actions")}<input type="number" min="1" max="5" value={draft.primary_actions} onChange={(event) => update("primary_actions", Number(event.target.value))} /></label>
        <label>{l("行动硬上限", "Action hard limit")}<input type="number" min="1" max="5" value={draft.max_actions} onChange={(event) => update("max_actions", Number(event.target.value))} /></label>
        <label>{l("缓冲比例", "Buffer ratio")} <span>{Math.round(draft.buffer_ratio * 100)}%</span><input type="range" min="0.1" max="0.5" step="0.05" value={draft.buffer_ratio} onChange={(event) => update("buffer_ratio", Number(event.target.value))} /></label>
        <label>{l("来源快照保留天数", "Snapshot retention days")}<input type="number" value={draft.snapshot_retention_days} onChange={(event) => update("snapshot_retention_days", Number(event.target.value))} /></label>
        <label>{l("简报保留天数", "Brief retention days")}<input type="number" value={draft.brief_retention_days} onChange={(event) => update("brief_retention_days", Number(event.target.value))} /></label>
        <button className="button danger" onClick={() => void cleanup()}><Trash2 size={16} />{l("立即清理过期数据", "Clean expired data now")}</button>
      </article>
    </div>
    <div className="callout privacy"><strong>{l("隐私说明", "Privacy")}</strong><p>{l("服务只监听 127.0.0.1；随机令牌保护本地 API。邮件正文和外部原始响应不落盘，只保存必要的归一化字段、来源入口和简报。外部来源始终只读。", "The service listens only on 127.0.0.1 and protects its local API with a random token. Mail bodies and raw external responses are not persisted; only necessary normalized fields, source links, and briefs are stored. External sources are always read only.")}</p></div>
  </section>;
}
