import { useState } from "react";
import { AlertCircle, CalendarClock, Check, GripVertical, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../api";
import { copy } from "../i18n";
import { localize } from "../i18n";
import { useStore } from "../store";
import type { DailyPlan } from "../types";

const time = (iso: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
function localDateTime(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function TodayPage() {
  const { data, refresh } = useStore();
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedAction, setDraggedAction] = useState<string | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  if (!data) return null;
  const t = copy[data.settings.language];
  const l = (chinese: string, english: string) => localize(data.settings.language, chinese, english);
  const brief = data.brief;
  const plan = brief && data.plan?.brief_id === brief.brief_id ? data.plan : null;
  const localTodayParts = new Intl.DateTimeFormat("en-CA", { timeZone: data.settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const localTodayValues = Object.fromEntries(localTodayParts.map((part) => [part.type, part.value]));
  const localToday = `${localTodayValues.year}-${localTodayValues.month}-${localTodayValues.day}`;
  const pageTitle = brief && brief.date !== localToday ? `${brief.date} ${l("预览", "Preview")}` : t.today;
  const actionOrder = plan?.action_order ?? brief?.actions.map((action) => action.action_id) ?? [];
  const orderedActions = actionOrder.map((id) => brief?.actions.find((action) => action.action_id === id)).filter((action): action is NonNullable<typeof action> => Boolean(action));
  const blocks = plan?.time_blocks ?? brief?.time_blocks ?? [];

  const generate = async () => {
    setGenerating(true); setError(null);
    try { await api.generate(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setGenerating(false); }
  };

  const savePlan = async (patch: Partial<DailyPlan>) => {
    if (!plan) return;
    setSaving(true); setError(null);
    try { await api.updatePlan(plan.date, patch); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

  const dropAction = (target: string) => {
    if (!draggedAction || draggedAction === target) return;
    const next = [...actionOrder];
    const from = next.indexOf(draggedAction);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, draggedAction);
    setDraggedAction(null);
    void savePlan({ action_order: next });
  };

  const dropBlock = (targetId: string) => {
    if (!plan || !draggedBlock || draggedBlock === targetId) return;
    const source = blocks.find((block) => block.block_id === draggedBlock);
    const target = blocks.find((block) => block.block_id === targetId);
    if (!source?.editable || !target?.editable) return;
    const next = blocks.map((block) => block.block_id === source.block_id
      ? { ...block, start_at: target.start_at, end_at: target.end_at }
      : block.block_id === target.block_id
        ? { ...block, start_at: source.start_at, end_at: source.end_at }
        : block);
    setDraggedBlock(null);
    void savePlan({ time_blocks: next });
  };

  const changeBlock = (blockId: string, key: "start_at" | "end_at", value: string) => {
    if (!plan || !value) return;
    const next = blocks.map((block) => block.block_id === blockId ? { ...block, [key]: new Date(value).toISOString() } : block);
    void savePlan({ time_blocks: next });
  };

  return <section>
    <header className="page-header"><div><p className="eyebrow">{brief && brief.date !== localToday ? l("当前时段不足，先展示下一工作日", "Not enough time remains today, so the next workday is shown") : new Intl.DateTimeFormat(data.settings.language, { dateStyle: "full" }).format(new Date())}</p><h1>{pageTitle}</h1></div><button className="button primary" onClick={() => void generate()} disabled={generating || saving}>{generating ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{t.generate}</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!brief ? <div className="empty-state"><Sparkles /><h2>{t.noBrief}</h2></div> : <>
      <div className="judgment"><span>{l("今日判断", "Today's judgment")}</span><h2>{brief.judgment}</h2>{brief.degraded && <p><AlertCircle size={15} />{l("部分来源不可用，已用可用信息降级生成。", "Some sources are unavailable. This brief was generated from the information that remains available.")}</p>}<div className="plan-state">{plan?.accepted ? <><Check size={15} /> {l("已接受今天的计划", "Today's plan is accepted")}</> : l("这是尚未确认的建议计划", "This is an unconfirmed suggested plan")}{plan?.adjusted && <span> · {l("含人工调整", "Includes manual adjustments")}</span>}</div></div>
      <div className="dashboard-grid">
        <article className="panel actions-panel"><div className="panel-title"><h2>{l("本人行动", "My actions")}</h2><span>{brief.actions.length} / {data.settings.max_actions}</span></div>{orderedActions.map((action, index) => <div className="action-row draggable" draggable={Boolean(plan)} onDragStart={() => setDraggedAction(action.action_id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropAction(action.action_id)} key={action.action_id}>{plan && <GripVertical className="drag-handle" size={17} />}<div className={`priority ${action.priority}`}>{index + 1}</div><div><strong>{action.title}</strong><p>{action.reason}</p></div><span className="duration">{action.estimate_minutes} {l("分钟", "min")}</span></div>)}</article>
        <article className="panel timeline-panel"><div className="panel-title"><h2>{l("今天的时间轴", "Today's timeline")}</h2><CalendarClock size={18} /></div>{[...blocks].sort((left, right) => left.start_at.localeCompare(right.start_at)).map((block) => <div className={`timeline-row ${block.kind} ${block.editable ? "draggable" : ""}`} draggable={Boolean(plan && block.editable)} onDragStart={() => setDraggedBlock(block.block_id)} onDragOver={(event) => { if (block.editable) event.preventDefault(); }} onDrop={() => dropBlock(block.block_id)} key={block.block_id}><time>{time(block.start_at)}</time><span /><div><strong>{block.editable && plan && <GripVertical className="inline-grip" size={14} />}{block.title}</strong><small>{time(block.start_at)}–{time(block.end_at)}</small>{block.editable && plan && <div className="block-editor"><label>{l("开始", "Start")}<input type="datetime-local" value={localDateTime(block.start_at)} onChange={(event) => changeBlock(block.block_id, "start_at", event.target.value)} /></label><label>{l("结束", "End")}<input type="datetime-local" value={localDateTime(block.end_at)} onChange={(event) => changeBlock(block.block_id, "end_at", event.target.value)} /></label></div>}</div></div>)}</article>
      </div>
      {plan && <div className="plan-actions"><p>{l("拖动行动可调整顺序；拖动可编辑时间块会交换时段。所有修改都会重新检查过去时间、固定事件冲突和缓冲。", "Drag actions to reorder them or drag editable blocks to swap time slots. Every change is rechecked for past times, fixed-event conflicts, and buffer.")}</p><button className="button primary" disabled={saving || plan.accepted} onClick={() => void savePlan({ accepted: true })}><Check size={16} />{plan.accepted ? l("计划已接受", "Plan accepted") : l("接受今天的计划", "Accept today's plan")}</button></div>}
      <article className="panel source-strip"><div className="panel-title"><h2>{l("来源状态", "Source status")}</h2><span>{l("更新于", "Updated at")} {time(brief.generated_at)}</span></div><div className="source-grid">{brief.source_status.map((source) => <div key={source.source_id}><span className={`source-state ${source.status}`} /> <strong>{source.source_id}</strong><p>{source.status === "ok" ? `${source.item_count} ${l("项", "items")}` : source.failure_reason ?? source.status}</p></div>)}</div></article>
    </>}
  </section>;
}
