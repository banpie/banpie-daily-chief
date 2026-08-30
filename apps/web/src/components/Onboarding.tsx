import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Inbox,
  MonitorCog,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import { api } from "../api";
import { localize } from "../i18n";
import { useStore } from "../store";
import type { OnboardingState } from "../types";

const stepTitles = [
  ["语言", "Language"], ["真实体检", "Capability check"], ["作息与工作时间", "Daily boundaries"],
  ["设备与来源", "Devices and sources"], ["本地收集箱", "Local inbox"], ["真实任务预览", "Real-task preview"], ["每日运行", "Daily run"]
] as const;

const deviceChoices: Array<{ id: OnboardingState["device_ecosystem"]; title: string; titleEn: string; detail: string; detailEn: string }> = [
  { id: "iphone_mac", title: "iPhone ＋ Mac", titleEn: "iPhone + Mac", detail: "可复用宿主已经授权的 Apple、Google 或 Microsoft 来源。", detailEn: "Reuse Apple, Google, or Microsoft sources already authorized in your agent." },
  { id: "iphone_no_mac", title: "iPhone，没有 Mac", titleEn: "iPhone without a Mac", detail: "优先使用 Google / Microsoft、ICS 文件或本地收集箱。", detailEn: "Start with Google or Microsoft, an ICS file, or the local inbox." },
  { id: "android_google", title: "Android ＋ Google", titleEn: "Android + Google", detail: "优先使用宿主已有的 Google 日历、任务和邮件能力。", detailEn: "Prefer Google calendar, task, and mail capabilities already available in your agent." },
  { id: "other", title: "其他设备", titleEn: "Other setup", detail: "从本地任务、标准文件和人工输入开始。", detailEn: "Start with local tasks, standard files, and manual input." }
];

function timeOrderIsValid(schedule: Record<string, string>): boolean {
  return schedule.wake_time < schedule.work_start
    && schedule.work_start < schedule.lunch_start
    && schedule.lunch_start < schedule.lunch_end
    && schedule.lunch_end < schedule.work_end
    && schedule.work_end < schedule.sleep_time;
}

export function Onboarding() {
  const { data, refresh } = useStore();
  if (!data) return null;

  const saved = data.onboarding;
  const [step, setStep] = useState(Math.max(0, Math.min(6, saved.current_step - 1)));
  const [language, setLanguage] = useState<"zh-CN" | "en">(data.settings.language);
  const [schedule, setSchedule] = useState(() => ({
    timezone: data.settings.timezone,
    wake_time: data.settings.wake_time,
    sleep_time: data.settings.sleep_time,
    work_start: data.settings.work_start,
    work_end: data.settings.work_end,
    lunch_start: data.settings.lunch_start,
    lunch_end: data.settings.lunch_end
  }));
  const [deviceEcosystem, setDeviceEcosystem] = useState<OnboardingState["device_ecosystem"]>(saved.device_ecosystem);
  const [selectedSources, setSelectedSources] = useState<string[]>(saved.selected_sources.length ? saved.selected_sources : ["local.tasks"]);
  const [draftTasks, setDraftTasks] = useState(() => saved.draft_tasks.length
    ? saved.draft_tasks.map((task) => ({ ...task }))
    : Array.from({ length: 3 }, (_, index) => ({
      draft_id: crypto.randomUUID(),
      title: "",
      estimate_minutes: index === 0 ? 60 : 30,
      priority: index === 0 ? "p1" as const : "p2" as const
    })));
  const [working, setWorking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const l = (chinese: string, english: string) => localize(language, chinese, english);

  const validTasks = useMemo(() => draftTasks.filter((task) => task.title.trim()).map((task) => ({
    ...task,
    title: task.title.trim()
  })), [draftTasks]);
  const doctor = data.doctor;

  const persistStep = async (nextStep: number) => {
    await api.updateOnboarding({
      current_step: nextStep + 1,
      device_ecosystem: deviceEcosystem,
      selected_sources: selectedSources,
      draft_tasks: validTasks
    });
  };

  const next = async () => {
    setWorking(true);
    setError(null);
    try {
      if (step === 0) await api.updateSettings({ language });
      if (step === 2) {
        if (!timeOrderIsValid(schedule)) throw new Error(l("请确认清醒、工作、午休和休息时间依次递增。跨夜作息可在完成向导后到设置中调整。", "Wake, work, lunch, and sleep times must be in order. You can configure an overnight schedule in Settings after onboarding."));
        await api.updateSettings(schedule);
      }
      if (step === 5) {
        if (validTasks.length < 3 || validTasks.length > 10) throw new Error(l("请输入 3–10 项真实任务。", "Enter 3–10 real tasks."));
        await api.previewOnboarding(validTasks);
        setStep(6);
        await refresh();
        return;
      }
      if (step === 6) {
        if (data.plan) await api.updatePlan(data.plan.date, { accepted: true });
        await api.updateOnboarding({ current_step: 7, completed_at: new Date().toISOString() });
        await api.updateSettings({ onboarding_completed: true });
        await refresh();
        return;
      }
      const nextStep = Math.min(6, step + 1);
      await persistStep(nextStep);
      setStep(nextStep);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  };

  const back = async () => {
    const nextStep = Math.max(0, step - 1);
    setError(null);
    setStep(nextStep);
    try { await persistStep(nextStep); } catch { /* 本地状态仍允许继续修改 */ }
  };

  const toggleSource = (id: string, checked: boolean) => {
    setSelectedSources((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true); setImportMessage(null);
    try {
      if (file.size > 1024 * 1024) throw new Error(l("文件不能超过 1 MB。", "The file cannot exceed 1 MB."));
      await api.importFile({ filename: file.name, content: await file.text(), source_id: `file.${file.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60)}` });
      setImportMessage(l(`已导入 ${file.name}；原始文件不会另行保存。`, `Imported ${file.name}. The original file is not stored separately.`));
      await refresh();
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : String(cause));
    } finally { setImporting(false); }
  };

  return <div className="onboarding-backdrop">
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-progress" aria-label={l(`第 ${step + 1} 步，共 7 步`, `Step ${step + 1} of 7`)}>
        {stepTitles.map(([title], index) => <span key={title} className={index <= step ? "active" : ""} />)}
      </div>
      <p className="eyebrow">{l(`第 ${step + 1} / 7 步`, `Step ${step + 1} / 7`)} · {stepTitles[step][language === "en" ? 1 : 0]}</p>

      {step === 0 && <div>
        <h1 id="onboarding-title">{l("先选择你看得最舒服的语言", "Choose the language you prefer")}</h1>
        <p>{l("默认中文，之后可以随时切换。", "Chinese is the default. You can switch at any time.")}</p>
        <div className="choice-grid">
          <button className={language === "zh-CN" ? "choice active" : "choice"} onClick={() => setLanguage("zh-CN")}>中文</button>
          <button className={language === "en" ? "choice active" : "choice"} onClick={() => setLanguage("en")}>English</button>
        </div>
      </div>}

      {step === 1 && <div>
        <MonitorCog className="hero-icon" />
        <h1 id="onboarding-title">{l("这是当前宿主的真实体检", "Here is the real capability check for this agent")}</h1>
        <div className="check-list">
          <p><Check /> {l("系统", "System")}: {doctor.operating_system}</p>
          <p><Check /> {l("宿主", "Agent")}: {doctor.agent_host}</p>
          <p><Check /> {l("本地数据库", "Local database")}: {doctor.local_database.writable ? l("可写", "Writable") : l("不可写", "Not writable")}</p>
          <p><Check /> {l("本地服务：仅监听 127.0.0.1", "Local service: bound to 127.0.0.1 only")}</p>
          <p><Check /> {l("定时运行", "Scheduled runs")}: {doctor.scheduler_available ? l("宿主支持", "Available in agent") : l("当前未发现", "Not detected")}</p>
          <p><Check /> {l("完成通知", "Completion notification")}: {doctor.notification_available ? l("宿主支持", "Available in agent") : l("当前未发现", "Not detected")}</p>
        </div>
        {doctor.agent_host === "Current host unknown" && <p className="privacy-note">{l("尚未收到宿主报告，所以这里只确认本地能力，不会根据浏览器信息猜测 Codex 或 WorkBuddy。", "No agent report was provided, so this checks only local capabilities. It never guesses Codex or WorkBuddy from browser data.")}</p>}
      </div>}

      {step === 2 && <div>
        <h1 id="onboarding-title">{l("告诉我一天的大致边界", "Set the boundaries of your day")}</h1>
        <p>{l("系统只在这些边界里排时间，并至少保留 20% 缓冲。", "Planning stays inside these boundaries and keeps at least 20% buffer.")}</p>
        <label>{l("时区", "Time zone")}<input value={schedule.timezone} onChange={(event) => setSchedule((current) => ({ ...current, timezone: event.target.value }))} placeholder="Asia/Shanghai" /></label>
        <div className="time-grid">
          {([['wake_time','通常清醒','Wake'],['work_start','工作开始','Work starts'],['lunch_start','午休开始','Lunch starts'],['lunch_end','午休结束','Lunch ends'],['work_end','工作结束','Work ends'],['sleep_time','通常休息','Sleep']] as const).map(([key,label,labelEn]) => <label key={key}>{l(label, labelEn)}<input type="time" value={schedule[key]} onChange={(event) => setSchedule((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
        </div>
      </div>}

      {step === 3 && <div>
        <ShieldCheck className="hero-icon" />
        <h1 id="onboarding-title">{l("选择设备和真正可用的来源", "Choose your devices and actually available sources")}</h1>
        <div className="choice-grid compact">
          {deviceChoices.map((choice) => <button key={choice.id} className={deviceEcosystem === choice.id ? "choice active" : "choice"} onClick={() => setDeviceEcosystem(choice.id)}><strong>{l(choice.title, choice.titleEn)}</strong><small>{l(choice.detail, choice.detailEn)}</small></button>)}
        </div>
        <div className="source-explain">
          <label className="source-choice"><input type="checkbox" checked={selectedSources.includes("local.tasks")} onChange={(event) => toggleSource("local.tasks", event.target.checked)} /><span><strong>{l("本地任务", "Local tasks")}</strong><small>{l("长期保存在这台电脑，可直接编辑。", "Stored on this computer and directly editable.")}</small></span></label>
          <label className="source-choice"><input type="checkbox" checked={selectedSources.includes("file.import")} onChange={(event) => toggleSource("file.import", event.target.checked)} /><span><strong>{l("标准文件", "Standard files")}</strong><small>{l("可以导入 ICS、CSV、Markdown 或 JSON。", "Import ICS, CSV, Markdown, or JSON.")}</small></span></label>
          {doctor.adapters.filter((adapter) => !["local-tasks", "standard-file-import"].includes(adapter.adapter_id)).map((adapter) => <label className="source-choice" key={adapter.adapter_id}><input type="checkbox" disabled={!adapter.available} checked={selectedSources.includes(adapter.adapter_id)} onChange={(event) => toggleSource(adapter.adapter_id, event.target.checked)} /><span><strong>{adapter.provider} · {adapter.capabilities.join(language === "en" ? ", " : "、")}</strong><small>{adapter.available ? l("当前可用", "Available") : adapter.failure_reason || l("当前不可用，请回到宿主连接对应插件。", "Unavailable. Reconnect the matching integration in your agent.")}</small></span></label>)}
        </div>
        <p className="privacy-note">{l("这里只记录你的偏好，不会自动登录或修改外部数据。读取失败会显示真实状态，不会写成“0 项”。", "This only records your preferences. It does not sign in or modify external data. Failed reads keep their real status instead of becoming a false zero.")}</p>
      </div>}

      {step === 4 && <div>
        <Inbox className="hero-icon" />
        <h1 id="onboarding-title">{l("本地收集箱已经就绪", "Your local inbox is ready")}</h1>
        <p>{l("没有任务应用或任务 OS 也没关系。本地任务可以编辑；外部任务始终以原应用为准。", "You do not need a task app or task OS. Local tasks are editable; external tasks remain owned by their source app.")}</p>
        <div className="demo-inbox">{l("随手记下一件事 → 稍后安排 → 进入今天或项目", "Capture something → schedule it later → move it into Today or a project")}</div>
        {selectedSources.includes("file.import") && <div className="onboarding-import"><p>{l("可现在导入 ICS、CSV、Markdown 或 JSON；也可以完成向导后再到“连接”页面导入。", "Import ICS, CSV, Markdown, or JSON now, or do it later from Connections.")}</p><label className="button ghost file-button"><Upload size={15} />{importing ? l("导入中…", "Importing…") : l("选择标准文件", "Choose a standard file")}<input aria-label={l("选择标准文件", "Choose a standard file")} type="file" disabled={importing} accept=".ics,.csv,.md,.markdown,.txt,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label>{importMessage && <p className="toast" role="status">{importMessage}</p>}</div>}
      </div>}

      {step === 5 && <div>
        <Sparkles className="hero-icon" />
        <h1 id="onboarding-title">{l("输入 3–10 件真实任务", "Enter 3–10 real tasks")}</h1>
        <p>{l("标题、时长和优先级会进入首份预览。再次提交会更新这批任务，不会重复创建。", "Titles, durations, and priorities are used in the first preview. Retrying updates this set instead of duplicating it.")}</p>
        <div className="draft-task-list">
          {draftTasks.map((task, index) => <div className="draft-task" key={task.draft_id}>
            <input value={task.title} onChange={(event) => setDraftTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder={(language === "en" ? ["Today's most important outcome", "Something to reply to or confirm", "One small step to move forward"] : ["今天最重要的结果", "需要回复或确认的事项", "可以推进的一小步"])[index] || l("另一项真实任务", "Another real task")} />
            <select value={task.estimate_minutes} onChange={(event) => setDraftTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, estimate_minutes: Number(event.target.value) } : item))}><option value={30}>30 {l("分钟", "min")}</option><option value={60}>60 {l("分钟", "min")}</option><option value={90}>90 {l("分钟", "min")}</option><option value={120}>120 {l("分钟", "min")}</option></select>
            <select value={task.priority} onChange={(event) => setDraftTasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priority: event.target.value as "p0" | "p1" | "p2" | "p3" } : item))}><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option></select>
            <button aria-label={l("删除这项任务", "Delete this task")} className="icon-button" disabled={draftTasks.length <= 3} onClick={() => setDraftTasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
          </div>)}
        </div>
        <button className="button ghost" disabled={draftTasks.length >= 10} onClick={() => setDraftTasks((current) => [...current, { draft_id: crypto.randomUUID(), title: "", estimate_minutes: 30, priority: "p2" }])}><Plus size={16} />{l("再加一项", "Add another")}</button>
      </div>}

      {step === 6 && <div>
        <Sparkles className="hero-icon" />
        <h1 id="onboarding-title">{l("这是你的首份今日预览", "Here is your first daily preview")}</h1>
        {data.brief ? <div className="onboarding-preview">
          <p className="eyebrow">{l("计划日期", "Plan date")} · {data.brief.date}</p>
          <h2>{data.brief.judgment}</h2>
          {data.brief.actions.map((action, index) => <article key={action.action_id}><strong>{index + 1}. {action.title}</strong><p>{action.reason}</p><small>{action.estimate_minutes} 分钟 · {action.priority.toUpperCase()}</small></article>)}
          {data.brief.deferred.length > 0 && <p className="preview-note">{l("延期", "Deferred")}: {data.brief.deferred.map((item) => `${item.title}${item.next_action ? ` (${item.next_action})` : ""}`).join(language === "en" ? "; " : "；")}</p>}
          <p className="preview-note">{l("来源", "Sources")}: {data.brief.source_status.map((source) => `${source.source_id} ${source.status}`).join(language === "en" ? "; " : "；")}</p>
        </div> : <p>{l("预览尚未保存，请返回上一步重试。", "The preview was not saved. Go back and try again.")}</p>}
        <p>{l("确认预览后，如果当前 Agent 支持定时任务，可以对它说：", "After accepting the preview, if your agent supports scheduled tasks, tell it:")}</p>
        <blockquote>{l("每天工作开始前为我运行半撇每日参谋。创建定时任务前，先告诉我时间、通知方式和会读取哪些来源。", "Run Banpie Daily Chief before my workday starts. Before creating the scheduled task, tell me the time, notification method, and which sources it will read.")}</blockquote>
        <p className="privacy-note">{l("本产品不会暗装系统定时器，也不要求额外模型密钥。", "This product never installs a system scheduler silently and does not require another model API key.")}</p>
      </div>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="onboarding-actions">
        <button className="button ghost" disabled={step === 0 || working} onClick={() => void back()}><ArrowLeft size={16} />{l("上一步", "Back")}</button>
        <button className="button primary" disabled={working || (step === 5 && validTasks.length < 3)} onClick={() => void next()}>{working ? l("正在处理…", "Working…") : step === 5 ? l("生成首份预览", "Generate first preview") : step === 6 ? l("接受并进入工作台", "Accept and open workspace") : l("继续", "Continue")}<ArrowRight size={16} /></button>
      </div>
    </section>
  </div>;
}
