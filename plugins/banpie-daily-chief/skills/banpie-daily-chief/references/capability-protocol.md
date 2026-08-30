# 能力与数据协议

## API 版本

当前 `api_version` 与 `schema_version` 均为 `1.0`。正式 JSON Schema 位于 `@banpie/daily-chief-core/schemas/v1/`。

## 能力标识

- `calendar.read`
- `tasks.read`
- `mail.read`
- `notes.read`
- `signals.read`
- `notification.send`
- `schedule.create`
- `local.tasks.write`

适配器声明 `adapter_id`、`api_version`、能力、宿主、操作系统、提供方、可用性、登录需求、只读状态、最近成功时间、失败原因和人工恢复入口。

## 来源状态

- `ok`：本轮成功读取，可给出事项数量。
- `not_connected`：从未连接。
- `login_required`：连接存在但需要用户重新登录。
- `read_failed`：本轮读取超时或失败。
- `stale`：只有过期缓存，不能冒充本轮结果。
- `not_read`：本轮主动跳过。

只有 `ok` 可以显示数值型事项数量。其他状态的 `item_count` 必须为 `null`。

## 对象

- `SourceSnapshot`：一次来源读取及其状态和标准候选。
- `Candidate`：事件、任务、邮件行动或信号。
- `Task`：本地任务，状态为 `inbox / next / waiting / someday / done / canceled`。
- `Project`：本地项目，状态为 `active / paused / done / canceled`。
- `DailyBrief`：今日判断、固定事件、最多五项行动、延期、待决定、时间块、来源状态和解释依据。
- `CapabilityReport`：当前环境和适配器体检。

重复规则内部使用 RFC 5545 RRULE，由界面或宿主生成，不要求普通用户填写原始规则。

