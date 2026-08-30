---
name: banpie-daily-chief
description: 为普通用户安装、体检和运行“半撇每日参谋”；聚合可用的日历、任务、邮件、笔记或人工输入，生成少而可行的每日计划。用户说每日简报、今天做什么、安排一天、每日规划、安装每日参谋或连接任务来源时使用。
---

# 半撇每日参谋

## 目标

把不同来源转换成版本化 `SourceSnapshot`，交给本地内核去重、排程和校验，再用同一份 `DailyBrief` 输出聊天 Markdown 和网页视图。来源缺失时仍交付可用简报，不要求用户先建立任务系统。

## 第一次安装

用户要求安装时：

1. 若 `daily-chief` 尚不存在，优先由 Agent 运行本 Skill 的 `scripts/install.mjs`。安装器下载当前系统的预构建运行时并校验 SHA-256；不要让普通用户打开终端，也不要在用户机器上执行完整源码构建。
2. 先根据当前会话真实可见的工具生成不含凭证的 `CapabilityReport` 临时文件，再运行 `daily-chief doctor --json --host-report <path>`；插件包也可以用 `node scripts/bridge.mjs doctor --json --host-report <path>`。没有真实报告时必须显示“当前宿主未知”，不能用浏览器字段或配置目录猜测。
3. 只做体检，不登录、不连接、不修改任何外部数据。
4. 用同一报告启动 `daily-chief serve --host-report <path>`，让用户在七步向导中设置语言、时区、作息和真实任务。
5. 使用内置任务库生成第一份预览；解释每项入选和延期原因。
6. 预览通过后，才询问是否使用当前宿主创建每日运行。宿主没有调度能力时保留“立即生成”和自然语言触发，不暗装系统定时器。

安装入口可以直接给 Agent：

> 帮我安装并配置“半撇每日参谋”，先体检，不要连接或修改任何外部数据，预览成功后再询问我是否启用每日运行。

七步向导的用户沟通细节见 [onboarding.md](references/onboarding.md)。

## 每日运行

1. 根据本轮真实可见的宿主工具刷新 `CapabilityReport`，运行 `daily-chief doctor --json --host-report <path>`，识别宿主、系统、本地库、调度和通知能力。
2. 按能力选择顺序获取来源：
   - 当前宿主的已知适配器；
   - 根据工具说明做语义能力发现；
   - ICS、CSV、Markdown、JSON 等标准文件；
   - 网页表单或对话人工输入。
3. 每个来源都必须生成独立 `SourceSnapshot`。只保存归一化字段和原入口，不把邮件正文或外部原始响应落盘。
4. 使用 `daily-chief ingest --source <id> --file <path>` 导入快照。
5. 运行 `daily-chief generate --date <YYYY-MM-DD> --format json` 得到确定性基线。宿主模型可以结合用户偏好调整判断和措辞，但不得改变真实截止、来源状态或外部只读边界。
6. 将最终 JSON 保存到临时文件并运行 `daily-chief validate --file <path>`。失败时修正后再输出；不能绕过最多五项、过去时间、重叠、虚假零值和硬截止遗漏校验。
7. 输出同一份 JSON 的聊天 Markdown；网页自动读取已保存的同一份简报。
8. 当前宿主有通知能力时只发送“简报已生成”的完成通知；没有时只更新网页和当前对话。

能力和对象契约见 [capability-protocol.md](references/capability-protocol.md)，宿主差异见 [host-adapters.md](references/host-adapters.md)。

## 固定命令

```bash
daily-chief doctor --json
daily-chief doctor --json --host-report <path>
daily-chief serve --host-report <path>
daily-chief ingest --source <id> --file <path>
daily-chief generate --date <date> --format json|markdown
daily-chief validate --file <path>
```

## 安全边界

- 本地服务只监听 `127.0.0.1`，使用每次启动随机令牌；不要改成 `0.0.0.0`、局域网或公网监听。
- 外部日历、任务和邮件默认只读；只有 `local.tasks.write` 允许本产品直接编辑。
- “未连接、需登录、读取失败、数据过期、本轮未读取”必须原样表达，不能改写成零事项。
- 旧缓存不能冒充本轮读取；过期快照只能作为明确标注的历史参考。
- 不索取模型 API Key，不自建 OAuth、IMAP、云同步或推送服务。
- 创建宿主定时任务前说明时间、来源、通知方式和可用的停用入口。
- Apple 私有数据在没有 Mac/iCloud 或宿主连接器时不承诺自动读取。

## 默认规划口径

- 三项主要行动，硬上限五项。
- 深度块 90 分钟、普通专注块 60 分钟、行政块 30 分钟。
- 至少保留 20% 缓冲。
- 真实截止优先；每日时间块不改写任务的截止或计划日。
- 不用复杂分数解释结果，直接写“今天截止、固定会议前准备、等待已到复查日、当前只有 60 分钟空档”等人能核对的原因。
