import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileInput, PlugZap, Upload, Wrench } from "lucide-react";
import { api } from "../api";
import { localize } from "../i18n";
import { useStore } from "../store";

const labels = {
  "zh-CN": { ok: "已读取", not_connected: "未连接", login_required: "需登录", read_failed: "读取失败", stale: "数据过期", not_read: "本轮未读取" },
  en: { ok: "Read", not_connected: "Not connected", login_required: "Login required", read_failed: "Read failed", stale: "Stale", not_read: "Not read this run" }
} as const;

export function ConnectionsPage() {
  const { data, refresh } = useStore();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return null;
  const language = data.settings.language;
  const l = (chinese: string, english: string) => localize(language, chinese, english);
  const sources = data.brief?.source_status ?? data.snapshots.map((source) => ({ ...source, item_count: source.status === "ok" ? source.items.length : null }));

  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true); setMessage(null);
    try {
      if (file.size > 1024 * 1024) throw new Error(l("文件不能超过 1 MB。", "The file cannot exceed 1 MB."));
      await api.importFile({ filename: file.name, content: await file.text(), source_id: `file.${file.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60)}` });
      setMessage(l(`已导入 ${file.name}；原始文件内容不会另行保存。`, `Imported ${file.name}. The original file content is not stored separately.`));
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally { setImporting(false); }
  };

  return <section>
    <header className="page-header"><div><p className="eyebrow">{l("能力，不是插件名字", "Capabilities, not plugin names")}</p><h1>{l("连接", "Connections")}</h1></div></header>
    {message && <p className="toast" role="status">{message}</p>}
    <div className="connection-grid">
      <article className="panel connection-card"><CheckCircle2 className="ok-icon" /><div><h2>{l("本地任务", "Local tasks")}</h2><p>{l("可读写 · 长期保存在本机", "Read/write · Stored locally")}</p></div><span className="badge active">{l("可用", "Available")}</span></article>
      <article className="panel connection-card"><FileInput /><div><h2>{l("标准文件导入", "Standard file import")}</h2><p>ICS, CSV, Markdown, JSON · {l("最大 1 MB", "1 MB maximum")}</p></div><label className="button ghost file-button"><Upload size={15} />{importing ? l("导入中…", "Importing…") : l("选择文件", "Choose file")}<input type="file" disabled={importing} accept=".ics,.csv,.md,.markdown,.txt,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label></article>
      {data.doctor.adapters.filter((adapter) => !["local-tasks", "standard-file-import"].includes(adapter.adapter_id)).map((adapter) => <article className="panel connection-card" key={adapter.adapter_id}>{adapter.available ? <PlugZap className="ok-icon" /> : <AlertTriangle className="warn-icon" />}<div><h2>{adapter.provider}</h2><p>{adapter.available ? l("当前可用", "Available") : adapter.needs_login ? l("需登录", "Login required") : l("当前不可用", "Unavailable")} · {adapter.read_only ? l("只读", "Read only") : l("可写", "Writable")}{adapter.last_success_at ? ` · ${l("最近成功", "Last success")} ${new Date(adapter.last_success_at).toLocaleString(language)}` : ""}</p></div>{!adapter.available && <button className="button ghost" onClick={() => window.alert(adapter.recovery_hint ?? l("请回到当前宿主重新登录或启用对应连接器。", "Reconnect or enable the matching integration in your agent.")) }><Wrench size={15} />{l("查看修复方式", "How to fix")}</button>}</article>)}
      {sources.filter((source) => source.source_id !== "local.tasks" && !data.doctor.adapters.some((adapter) => adapter.adapter_id === source.source_id)).map((source) => <article className="panel connection-card" key={source.source_id}>{source.status === "ok" ? <PlugZap className="ok-icon" /> : <AlertTriangle className="warn-icon" />}<div><h2>{source.source_id}</h2><p>{labels[language][source.status as keyof typeof labels[typeof language]] ?? source.status}{source.item_count === null ? "" : ` · ${source.item_count} ${l("项", "items")}`}</p></div>{source.status !== "ok" && <button className="button ghost" onClick={() => window.alert(source.recovery_hint ?? l("请让当前 Agent 重新登录或读取该来源；也可以暂时跳过，改用标准文件或人工输入。", "Ask your agent to reconnect or read this source. You can also skip it and use a standard file or manual input.")) }><Wrench size={15} />{l("查看修复方式", "How to fix")}</button>}</article>)}
    </div>
    <div className="callout"><strong>{l("兼容规则", "Compatibility rule")}</strong><p>{l("先用宿主已安装的能力；找不到时尝试语义发现、标准文件，最后回到人工输入。任何可选来源失败都不会阻断简报。", "Use capabilities already installed in the agent first, then semantic discovery, standard files, and finally manual input. An optional source failure never blocks the brief.")}</p></div>
  </section>;
}
