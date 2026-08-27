# 宿主适配

## WorkBuddy

读取插件清单和当前可用工具说明，按语义匹配能力。鉴权、通知和调度由 WorkBuddy 承担；适配器只负责输出 `SourceSnapshot`，不复制排序规则。

## Codex

读取已安装 Apps/插件和工具说明，按语义匹配能力。只有环境明确提供自动化能力时才创建每日任务；插件本身不修改 Codex 运行配置。

## 其他 Agent

能读 `SKILL.md` 且能运行命令时，使用通用 Skill 和 CLI。不能运行命令时，退化为纯对话：要求用户提供任务或标准文件，仍按最多五项、来源状态和只读边界输出，但要明确本轮没有本地校验器证据。

## 等价性要求

不同宿主可以有不同工具名，但同一业务对象必须转换成相同字段语义。使用仓库 `fixtures/equivalent-workbuddy.json` 与 `fixtures/equivalent-codex.json` 验证去重和最终 `DailyBrief` 等价性。

