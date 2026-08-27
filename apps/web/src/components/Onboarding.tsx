import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Inbox, MonitorCog, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";

const stepTitles = ["语言", "环境体检", "作息与工作时间", "选择数据源", "本地收集箱", "真实任务预览", "每日运行"];

export function Onboarding() {
  const { data, refresh } = useStore();
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<"zh-CN" | "en">(data?.settings.language ?? "zh-CN");
  const [tasks, setTasks] = useState(["", "", ""]);
  const [schedule, setSchedule] = useState(() => ({
    wake_time: data?.settings.wake_time ?? "07:00", sleep_time: data?.settings.sleep_time ?? "23:00",
    work_start: data?.settings.work_start ?? "09:00", work_end: data?.settings.work_end ?? "18:00",
    lunch_start: data?.settings.lunch_start ?? "12:00", lunch_end: data?.settings.lunch_end ?? "13:30"
  }));
  const [selectedSources, setSelectedSources] = useState(["local"]);
  const [working, setWorking] = useState(false);
  const environment = useMemo(() => ({ platform: navigator.platform || "Unknown", agent: "由当前 Agent 提供插件、模型、通知和调度" }), []);
  if (!data) return null;

  const next = async () => {
    setWorking(true);
    try {
      if (step === 0) await api.updateSettings({ language });
      if (step === 2) await api.updateSettings(schedule);
      if (step === 5) {
        await Promise.all(tasks.map((item) => item.trim()).filter(Boolean).map((title) => api.createTask({ title, status: "next", priority: "p2", estimate_minutes: 30 })));
        await api.generate();
      }
      if (step === 6) {
        await api.updateSettings({ onboarding_completed: true });
        await refresh();
        return;
      }
      setStep((value) => Math.min(6, value + 1));
      await refresh();
    } finally { setWorking(false); }
  };

  return <div className="onboarding-backdrop"><section className="onboarding-card" aria-labelledby="onboarding-title"><div className="onboarding-progress" aria-label={`第 ${step + 1} 步，共 7 步`}>{stepTitles.map((title, index) => <span key={title} className={index <= step ? "active" : ""} />)}</div><p className="eyebrow">第 {step + 1} / 7 步 · {stepTitles[step]}</p>
    {step === 0 && <div><h1 id="onboarding-title">先选择你看得最舒服的语言</h1><p>默认中文，之后可以随时切换。</p><div className="choice-grid"><button className={language === "zh-CN" ? "choice active" : "choice"} onClick={() => setLanguage("zh-CN")}>中文</button><button className={language === "en" ? "choice active" : "choice"} onClick={() => setLanguage("en")}>English</button></div></div>}
    {step === 1 && <div><MonitorCog className="hero-icon" /><h1 id="onboarding-title">环境已经可以运行</h1><div className="check-list"><p><Check /> 系统：{environment.platform}</p><p><Check /> 本地数据库：可写</p><p><Check /> 服务地址：仅 127.0.0.1</p></div><p>{environment.agent}</p></div>}
    {step === 2 && <div><h1 id="onboarding-title">告诉我一天的大致边界</h1><p>系统会在这些边界里排时间，并至少保留 20% 缓冲。</p><div className="time-grid">{([['wake_time','通常清醒'],['work_start','工作开始'],['lunch_start','午休开始'],['lunch_end','午休结束'],['work_end','工作结束'],['sleep_time','通常休息']] as const).map(([key,label]) => <label key={key}>{label}<input type="time" value={schedule[key]} onChange={(event) => setSchedule((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div></div>}
    {step === 3 && <div><ShieldCheck className="hero-icon" /><h1 id="onboarding-title">来源是可选的，不连接也能用</h1><div className="source-explain">{[{id:'local',title:'本地任务',detail:'长期保存，可直接编辑'},{id:'host',title:'宿主已连接来源',detail:'日历 / 邮件 / 外部任务只读'},{id:'files',title:'标准文件',detail:'ICS / CSV / Markdown / JSON'}].map((source) => <label className="source-choice" key={source.id}><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} /><span><strong>{source.title}</strong><small>{source.detail}</small></span></label>)}</div><p className="privacy-note">这里只选择本轮引导方式，不会自动登录或连接外部数据。读取失败会显示真实状态，不会写成“0 项”。</p></div>}
    {step === 4 && <div><Inbox className="hero-icon" /><h1 id="onboarding-title">你已经有一个本地收集箱</h1><p>没有任务应用或任务 OS 也没关系。这里的任务只存这台电脑，外部任务仍以原应用为准。</p><div className="demo-inbox">随手记下一件事 → 稍后安排 → 进入今天或项目</div></div>}
    {step === 5 && <div><Sparkles className="hero-icon" /><h1 id="onboarding-title">输入 3–10 件真实任务</h1><p>先从三件开始。系统会解释为什么今天做、为什么延期。</p>{tasks.map((task, index) => <input key={index} value={task} onChange={(event) => setTasks((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={["今天最重要的结果", "需要回复或确认的事项", "可以推进的一小步"][index]} />)}</div>}
    {step === 6 && <div><Sparkles className="hero-icon" /><h1 id="onboarding-title">预览已准备好</h1><p>现在可以直接使用“立即生成”。如果当前 Agent 支持定时任务，完成向导后再对它说：</p><blockquote>每天工作开始前为我运行半撇每日参谋。创建定时任务前，先告诉我时间、通知方式和会读取哪些来源。</blockquote><p className="privacy-note">本产品不会暗装系统定时器，也不要求额外模型密钥。</p></div>}
    <div className="onboarding-actions"><button className="button ghost" disabled={step === 0 || working} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={16} />上一步</button><button className="button primary" disabled={working || (step === 5 && tasks.filter((item) => item.trim()).length < 3)} onClick={() => void next()}>{step === 6 ? "进入工作台" : "继续"}<ArrowRight size={16} /></button></div>
  </section></div>;
}
