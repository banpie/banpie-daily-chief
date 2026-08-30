# 宿主适配

## 真实宿主报告

宿主桥必须把当前会话真实可见的能力写成 `CapabilityReport` JSON，再把文件路径交给 `doctor --host-report` 和 `serve --host-report`。报告只包含宿主名、操作系统、是否存在调度和通知能力，以及各适配器的能力、登录状态、只读状态、最近成功时间和修复提示；禁止写入 OAuth 令牌、Cookie、邮件正文或外部原始响应。

未能生成报告时继续运行本地模式，但 `agent_host` 固定写为 `Current host unknown`。宿主目录存在、浏览器 User-Agent 或操作系统类型都不能证明当前对话由哪个 Agent 执行。

## WorkBuddy

读取插件清单和当前可用工具说明，按语义匹配能力。鉴权、通知和调度由 WorkBuddy 承担；适配器只负责输出 `SourceSnapshot`，不复制排序规则。预构建运行时优先保存在 `${CODEBUDDY_PLUGIN_DATA}`，用户任务数据库仍保存在半撇每日参谋的独立本地数据目录，避免插件升级覆盖任务。

## Codex

读取已安装 Apps/插件和工具说明，按语义匹配能力。只有环境明确提供自动化能力时才创建每日任务；插件本身不修改 Codex 运行配置。

## 其他 Agent

能读 `SKILL.md` 且能运行命令时，使用通用 Skill 和 CLI。不能运行命令时，退化为纯对话：要求用户提供任务或标准文件，仍按最多五项、来源状态和只读边界输出，但要明确本轮没有本地校验器证据。

## 等价性要求

不同宿主可以有不同工具名，但同一业务对象必须转换成相同字段语义。使用仓库 `fixtures/equivalent-workbuddy.json` 与 `fixtures/equivalent-codex.json` 验证去重和最终 `DailyBrief` 等价性。
