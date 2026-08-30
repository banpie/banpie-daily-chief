import { useStore } from "../store";
import { localize } from "../i18n";

export function RunsPage() {
  const { data } = useStore();
  if (!data) return null;
  const l = (chinese: string, english: string) => localize(data.settings.language, chinese, english);
  return <section><header className="page-header"><div><p className="eyebrow">{l("成功、降级和失败分开", "Success, degradation, and failure stay distinct")}</p><h1>{l("运行记录", "Runs")}</h1></div></header><article className="panel table-wrap"><table><thead><tr><th>{l("时间", "Time")}</th><th>{l("状态", "Status")}</th><th>{l("耗时", "Duration")}</th><th>{l("缺失来源", "Missing sources")}</th><th>{l("说明", "Details")}</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.run_id}><td>{new Date(run.started_at).toLocaleString(data.settings.language)}</td><td><span className={`badge ${run.status}`}>{run.status}</span></td><td>{run.duration_ms} ms</td><td>{run.missing_sources.join(data.settings.language === "en" ? ", " : "、") || "—"}</td><td>{run.error || "—"}</td></tr>)}</tbody></table>{data.runs.length === 0 && <div className="empty-state compact"><h2>{l("还没有运行记录", "No runs yet")}</h2></div>}</article></section>;
}
