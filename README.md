# 半撇每日参谋

一个本地优先、宿主无关的每日工作参谋。它把日历、任务、邮件行动和人工输入归一化，选出少量真正要做的事，安排不重叠的时间块，并诚实显示每个来源是否读取成功。

当前稳定版本：`1.0.2`。自动化、跨平台制品、双宿主自然语言与原生定时运行、降级和安全边界均已完成验收；完整证据见 [1.0.2 验收报告](docs/verification/1.0.2-evidence.md)。

[English](README.en.md) · [隐私说明](PRIVACY.md) · [安全政策](SECURITY.md) · [适配器开发](docs/adapter-development.md)

## 最适合普通人的安装方式

把下面这段话复制给 WorkBuddy、Codex 或任何能运行命令的 Agent：

> 帮我安装并配置“半撇每日参谋”，先体检，不要连接或修改任何外部数据，预览成功后再询问我是否启用每日运行。

Agent 会完成环境体检和本地安装。你只需要在网页向导里：选择语言、确认作息、了解来源、输入三件真实任务、查看第一份预览。没有任务 App、没有任务 OS、没有邮件插件也可以使用。

稳定版可从 [GitHub Releases](https://github.com/banpie/banpie-daily-chief/releases) 下载通用 Skill、WorkBuddy 或 Codex 压缩包。包内安装器会从固定版本标签安装本地运行时，用户不需要操作终端。

## 目前可以做什么

- 本地收集箱、任务、项目、截止、计划日、预计时长、重复规则、完成和取消。
- 同一份 `DailyBrief` 同时渲染聊天 Markdown 和网页，避免两套排序结果。
- 真实截止优先、最多五项行动、过去时间和重叠时间块拦截、至少 20% 缓冲。
- 来源显示“已读取 / 未连接 / 需登录 / 读取失败 / 数据过期 / 本轮未读取”，失败不冒充零事项。
- WorkBuddy、Codex 和通用 Skill 包；其他 Agent 可用 `SKILL.md` + CLI + 标准文件模式。
- macOS、Windows 正式支持目标；Linux 对核心、CLI 和网页做 CI 验证。

## 数据与兼容原则

模型、OAuth、连接器、通知和定时任务由当前宿主 Agent 提供。公共产品不要求你再填一个模型 API Key，也不自建云账号、云同步、IMAP、OAuth 或推送服务。

能力发现顺序固定：宿主已知适配器 → 根据工具说明语义发现 → ICS/CSV/Markdown/JSON → 网页或对话人工输入。外部日历、任务和邮件默认只读；只有内置本地任务可直接编辑。

## 开发者快速开始

```bash
git clone https://github.com/banpie/banpie-daily-chief.git
cd banpie-daily-chief
npm install
npm run check
node packages/cli/dist/index.js serve
```

固定 CLI：

```bash
daily-chief doctor --json
daily-chief serve
daily-chief ingest --source <id> --file <path>
daily-chief generate --date <date> --format json|markdown
daily-chief validate --file <path>
```

固定版本安装器（适合 Agent 执行，位于 Skill 或插件包内）：

```bash
node scripts/install.mjs
node scripts/bridge.mjs doctor --json
node scripts/bridge.mjs serve
```

`@banpie/daily-chief-core` 与 CLI 的 npm 包结构已经完成并通过 `npm pack` 验证；Agent 安装默认使用带 SHA-256 校验的 GitHub 固定标签制品。

## 仓库结构

```text
packages/core/       JSON 契约、去重、排程、校验、SQLite
packages/cli/        固定 CLI、本地 API 和回环网页服务
apps/web/            React 七步向导与工作台
skills/              通用 Agent Skill
plugins/workbuddy/   WorkBuddy 插件包
plugins/banpie-daily-chief/  Codex 插件包
fixtures/            跨宿主等价夹具
docs/                架构、安装、适配器和隐私说明
```

## 发布状态

- `0.1` 公共契约和无插件本地模式：已实现。
- `0.2` SQLite 任务管理器、七步向导和网页：已实现并通过浏览器及跨平台验收。
- `0.3` WorkBuddy/Codex/通用 Skill 包：已实现并通过双宿主等价验收。
- `1.0`：已通过发布门槛并稳定发布。

明确不做：外部任务双向同步、团队协作、手机独立运行、云同步、健康公共适配器、IMAP、自建 OAuth、局域网和公网访问。

## 许可证

[Apache License 2.0](LICENSE)。
