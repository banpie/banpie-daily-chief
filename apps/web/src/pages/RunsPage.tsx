import { useStore } from "../store";

export function RunsPage() {
  const { data } = useStore();
  if (!data) return null;
  return <section><header className="page-header"><div><p className="eyebrow">成功、降级和失败分开</p><h1>运行记录</h1></div></header><article className="panel table-wrap"><table><thead><tr><th>时间</th><th>状态</th><th>耗时</th><th>缺失来源</th><th>说明</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.run_id}><td>{new Date(run.started_at).toLocaleString()}</td><td><span className={`badge ${run.status}`}>{run.status}</span></td><td>{run.duration_ms} ms</td><td>{run.missing_sources.join("、") || "—"}</td><td>{run.error || "—"}</td></tr>)}</tbody></table>{data.runs.length === 0 && <div className="empty-state compact"><h2>还没有运行记录</h2></div>}</article></section>;
}

