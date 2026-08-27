import { useState } from "react";
import { AlertCircle, CalendarClock, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../api";
import { copy } from "../i18n";
import { useStore } from "../store";

const time = (iso: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function TodayPage() {
  const { data, refresh } = useStore();
  const [generating, setGenerating] = useState(false);
  if (!data) return null;
  const t = copy[data.settings.language];
  const brief = data.brief;
  const generate = async () => { setGenerating(true); try { await api.generate(); await refresh(); } finally { setGenerating(false); } };
  return <section><header className="page-header"><div><p className="eyebrow">{new Intl.DateTimeFormat(data.settings.language, { dateStyle: "full" }).format(new Date())}</p><h1>{t.today}</h1></div><button className="button primary" onClick={() => void generate()} disabled={generating}>{generating ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{t.generate}</button></header>
    {!brief ? <div className="empty-state"><Sparkles /><h2>{t.noBrief}</h2></div> : <><div className="judgment"><span>今日判断</span><h2>{brief.judgment}</h2>{brief.degraded && <p><AlertCircle size={15} />部分来源不可用，已用可用信息降级生成。</p>}</div><div className="dashboard-grid"><article className="panel actions-panel"><div className="panel-title"><h2>本人行动</h2><span>{brief.actions.length} / {data.settings.max_actions}</span></div>{brief.actions.map((action, index) => <div className="action-row" key={action.action_id}><div className={`priority ${action.priority}`}>{index + 1}</div><div><strong>{action.title}</strong><p>{action.reason}</p></div><span className="duration">{action.estimate_minutes} 分钟</span></div>)}</article><article className="panel timeline-panel"><div className="panel-title"><h2>今天的时间轴</h2><CalendarClock size={18} /></div>{brief.time_blocks.map((block) => <div className={`timeline-row ${block.kind}`} key={block.block_id}><time>{time(block.start_at)}</time><span /><div><strong>{block.title}</strong><small>{time(block.start_at)}–{time(block.end_at)}</small></div></div>)}</article></div><article className="panel source-strip"><div className="panel-title"><h2>来源状态</h2><span>更新于 {time(brief.generated_at)}</span></div><div className="source-grid">{brief.source_status.map((source) => <div key={source.source_id}><span className={`source-state ${source.status}`} /> <strong>{source.source_id}</strong><p>{source.status === "ok" ? `${source.item_count} 项` : source.failure_reason ?? source.status}</p></div>)}</div></article></>}
  </section>;
}

