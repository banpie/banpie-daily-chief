#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
  DailyChiefDatabase,
  validateDailyBrief
} from "@banpie/daily-chief-core";
import { runDoctor } from "./doctor.js";
import { formatBrief, generateFromDatabase } from "./generate.js";
import { importStandardFile } from "./import-file.js";
import { defaultDatabasePath } from "./paths.js";
import { startServer } from "./server.js";

const program = new Command();
program.name("daily-chief").description("半撇每日参谋本地 CLI").version("1.0.0");
program.option("--database <path>", "SQLite database path", defaultDatabasePath());

program.command("doctor")
  .description("探测当前宿主、系统和可用能力")
  .option("--json", "output JSON")
  .option("--host-report <path>", "validated host capability report")
  .action((options: { json?: boolean; hostReport?: string }) => {
    const report = runDoctor(program.opts<{ database: string }>().database, options.hostReport);
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `Host: ${report.agent_host}\nOS: ${report.operating_system}\nDatabase: ${report.local_database.available ? "OK" : "FAILED"}\n`);
  });

program.command("ingest")
  .description("导入标准 SourceSnapshot JSON")
  .requiredOption("--source <id>", "source id")
  .requiredOption("--file <path>", "snapshot JSON file")
  .action((options: { source: string; file: string }) => {
    const db = new DailyChiefDatabase(program.opts<{ database: string }>().database);
    const input = importStandardFile({ path: options.file, sourceId: options.source, timezone: db.getSettings().timezone });
    if (input.source_id !== options.source) throw new Error(`--source ${options.source} does not match file source_id ${input.source_id}`);
    try {
      db.saveSnapshot(input);
      process.stdout.write(`${JSON.stringify({ ok: true, snapshot_id: input.snapshot_id, source_id: input.source_id })}\n`);
    } finally {
      db.close();
    }
  });

program.command("generate")
  .description("生成每日简报")
  .option("--date <date>", "date in YYYY-MM-DD")
  .option("--format <format>", "json or markdown", "markdown")
  .action((options: { date?: string; format: string }) => {
    if (!['json', 'markdown'].includes(options.format)) throw new Error("--format must be json or markdown");
    const db = new DailyChiefDatabase(program.opts<{ database: string }>().database);
    try {
      const { brief } = generateFromDatabase(db, options.date);
      process.stdout.write(formatBrief(brief, options.format as "json" | "markdown", db.getSettings().language));
    } finally {
      db.close();
    }
  });

program.command("validate")
  .description("校验 DailyBrief JSON")
  .requiredOption("--file <path>", "brief JSON file")
  .action((options: { file: string }) => {
    const input = JSON.parse(readFileSync(options.file, "utf8"));
    const result = validateDailyBrief(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  });

program.command("serve")
  .description("启动仅监听本机回环地址的网页工作台")
  .option("--port <port>", "local port", (value) => Number.parseInt(value, 10), 3210)
  .option("--host-report <path>", "validated host capability report")
  .option("--no-open", "do not open a browser")
  .action(async (options: { port: number; open: boolean; hostReport?: string }) => {
    const result = await startServer({
      port: options.port,
      openBrowser: options.open,
      databasePath: program.opts<{ database: string }>().database,
      ...(process.env.DAILY_CHIEF_LOCAL_TOKEN ? { token: process.env.DAILY_CHIEF_LOCAL_TOKEN } : {}),
      ...(options.hostReport ? { hostReportPath: options.hostReport } : {})
    });
    process.stdout.write(`半撇每日参谋已启动：${result.url}\n`);
  });

program.command("seed-demo")
  .description("写入不含个人信息的演示任务")
  .action(() => {
    const db = new DailyChiefDatabase(program.opts<{ database: string }>().database);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tasks = [
        db.createTask({ title: "完成季度方案第一页", status: "next", priority: "p0", plan_date: today, estimate_minutes: 90, next_action: "写清目标、受众和完成标准" }),
        db.createTask({ title: "回复合作方确认邮件", status: "next", priority: "p1", estimate_minutes: 30 }),
        db.createTask({ title: "整理本周收集箱", status: "inbox", priority: "p2", estimate_minutes: 45 })
      ];
      process.stdout.write(`${JSON.stringify(tasks, null, 2)}\n`);
    } finally {
      db.close();
    }
  });

program.parseAsync().catch((caught) => {
  const message = caught instanceof Error ? caught.message : String(caught);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
