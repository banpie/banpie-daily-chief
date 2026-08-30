import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Onboarding } from "./components/Onboarding";
import { useStore } from "./store";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { InboxPage } from "./pages/InboxPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";

export default function App() {
  const { data, loading, error } = useStore();
  if (loading) return <div className="splash"><div className="brand-mark">参</div><p>正在读取本地工作台… / Loading local workspace…</p></div>;
  if (error) return <div className="splash error"><h1>无法打开工作台 / Cannot open workspace</h1><p>{error}</p><small>请使用 daily-chief serve 输出的完整本地链接。 / Use the full local URL printed by daily-chief serve.</small></div>;
  return <BrowserRouter><Routes><Route element={<Layout />}><Route index element={<TodayPage />} /><Route path="inbox" element={<InboxPage />} /><Route path="tasks" element={<TasksPage />} /><Route path="projects" element={<ProjectsPage />} /><Route path="connections" element={<ConnectionsPage />} /><Route path="runs" element={<RunsPage />} /><Route path="settings" element={<SettingsPage />} /></Route></Routes>{data && !data.settings.onboarding_completed ? <Onboarding /> : null}</BrowserRouter>;
}
