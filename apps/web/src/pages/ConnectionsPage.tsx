import { AlertTriangle, CheckCircle2, FileInput, PlugZap, Wrench } from "lucide-react";
import { useStore } from "../store";

const labels: Record<string, string> = { ok: "已读取", not_connected: "未连接", login_required: "需登录", read_failed: "读取失败", stale: "数据过期", not_read: "本轮未读取" };

export function ConnectionsPage() {
  const { data } = useStore();
  if (!data) return null;
  const sources = data.brief?.source_status ?? data.snapshots.map((source) => ({ ...source, item_count: source.status === "ok" ? source.items.length : null }));
  return <section><header className="page-header"><div><p className="eyebrow">能力，不是插件名字</p><h1>连接</h1></div></header><div className="connection-grid"><article className="panel connection-card"><CheckCircle2 className="ok-icon" /><div><h2>本地任务</h2><p>可读写 · 长期保存在本机</p></div><span className="badge active">可用</span></article><article className="panel connection-card"><FileInput /><div><h2>标准文件导入</h2><p>ICS、CSV、Markdown、JSON</p></div><span className="badge active">可用</span></article>{sources.filter((source) => source.source_id !== "local.tasks").map((source) => <article className="panel connection-card" key={source.source_id}>{source.status === "ok" ? <PlugZap className="ok-icon" /> : <AlertTriangle className="warn-icon" />}<div><h2>{source.source_id}</h2><p>{labels[source.status] ?? source.status}{source.item_count === null ? "" : ` · ${source.item_count} 项`}</p></div>{source.status !== "ok" && <button className="button ghost" onClick={() => window.alert(source.recovery_hint ?? "请让当前 Agent 重新登录或读取该来源；也可以暂时跳过，改用标准文件或人工输入。") }><Wrench size={15} />查看修复方式</button>}</article>)}</div><div className="callout"><strong>兼容规则</strong><p>先用宿主已安装的能力；找不到时尝试语义发现、标准文件，最后回到人工输入。任何可选来源失败都不会阻断简报。</p></div></section>;
}
