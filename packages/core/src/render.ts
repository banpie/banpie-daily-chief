import { format, parseISO } from "date-fns";
import type { DailyBrief } from "./contracts.js";

const sourceLabel: Record<string, string> = {
  ok: "已读取",
  not_connected: "未连接",
  login_required: "需登录",
  read_failed: "读取失败",
  stale: "数据过期",
  not_read: "本轮未读取"
};

export function renderDailyBriefMarkdown(brief: DailyBrief, language: "zh-CN" | "en" = "zh-CN"): string {
  if (language === "en") return renderEnglish(brief);
  const lines = [
    `# 半撇每日参谋｜${brief.date}`,
    "",
    `> ${brief.judgment}`,
    "",
    "## 今天的行动",
    ""
  ];
  if (brief.actions.length === 0) lines.push("- 暂无可确认行动。", "");
  brief.actions.forEach((action, index) => lines.push(`${index + 1}. **${action.title}**（${action.estimate_minutes} 分钟）— ${action.reason}`));
  lines.push("", "## 时间安排", "");
  if (brief.time_blocks.length === 0) lines.push("- 暂无时间块。", "");
  brief.time_blocks.forEach((block) => lines.push(`- ${format(parseISO(block.start_at), "HH:mm")}–${format(parseISO(block.end_at), "HH:mm")}｜${block.title}`));
  if (brief.decisions.length > 0) {
    lines.push("", "## 待决定 / 等待", "");
    brief.decisions.forEach((item) => lines.push(`- ${item.title}${item.risk ? `：${item.risk}` : ""}`));
  }
  if (brief.deferred.length > 0) {
    lines.push("", "## 延期候选", "");
    brief.deferred.slice(0, 10).forEach((item) => lines.push(`- ${item.title}`));
  }
  lines.push("", "## 来源状态", "");
  brief.source_status.forEach((source) => {
    const count = source.item_count === null ? "" : `，${source.item_count} 项`;
    lines.push(`- ${source.source_id}：${sourceLabel[source.status] ?? source.status}${count}${source.failure_reason ? `（${source.failure_reason}）` : ""}`);
  });
  return `${lines.join("\n").trim()}\n`;
}

function renderEnglish(brief: DailyBrief): string {
  const lines = [`# Banpie Daily Chief | ${brief.date}`, "", `> ${brief.judgment}`, "", "## Actions", ""];
  brief.actions.forEach((action, index) => lines.push(`${index + 1}. **${action.title}** (${action.estimate_minutes} min) — ${action.reason}`));
  lines.push("", "## Schedule", "");
  brief.time_blocks.forEach((block) => lines.push(`- ${format(parseISO(block.start_at), "HH:mm")}–${format(parseISO(block.end_at), "HH:mm")} | ${block.title}`));
  lines.push("", "## Sources", "");
  brief.source_status.forEach((source) => lines.push(`- ${source.source_id}: ${source.status}${source.item_count === null ? "" : `, ${source.item_count} items`}`));
  return `${lines.join("\n").trim()}\n`;
}

