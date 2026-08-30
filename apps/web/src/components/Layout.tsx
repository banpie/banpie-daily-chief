import { CalendarDays, FolderKanban, Inbox, ListChecks, PlugZap, ScrollText, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { copy } from "../i18n";
import { useStore } from "../store";

const routes = [
  ["/", "today", CalendarDays], ["/inbox", "inbox", Inbox], ["/tasks", "tasks", ListChecks],
  ["/projects", "projects", FolderKanban], ["/connections", "connections", PlugZap],
  ["/runs", "runs", ScrollText], ["/settings", "settings", Settings]
] as const;

export function Layout() {
  const { data } = useStore();
  const t = copy[data?.settings.language ?? "zh-CN"];
  return <div className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">参</div><div><strong>{data?.settings.language === "en" ? "Banpie Daily Chief" : "半撇每日参谋"}</strong><span>Local · Private · Calm</span></div></div><nav aria-label={data?.settings.language === "en" ? "Main navigation" : "主导航"}>{routes.map(([path, key, Icon]) => <NavLink key={path} to={path} end={path === "/"}><Icon size={18} aria-hidden="true" /><span>{t[key]}</span></NavLink>)}</nav><div className="local-note"><span className="status-dot" />{data?.settings.language === "en" ? "Runs only on this computer" : "仅在这台电脑运行"}</div></aside><main className="main"><Outlet /></main></div>;
}
