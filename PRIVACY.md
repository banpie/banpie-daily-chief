# 隐私说明 / Privacy

半撇每日参谋采用本地优先架构：

- 网页服务只监听 `127.0.0.1`，每次启动生成随机本地令牌。
- 不建设产品云账号、云同步、模型 API、OAuth、IMAP 或推送服务器。
- 邮件正文和外部原始响应只在当前 Agent 的读取过程中转换，不写入数据库。
- 数据库只保存必要的归一化字段、原入口、来源状态、本地任务、项目和简报。
- 外部快照默认保留 7 天，简报默认保留 90 天，本地任务和项目长期保存；用户可修改保留期并清理。
- 外部任务、日历和邮件默认只读，不隐式写回。
- 卸载程序时默认保留用户数据；只有用户明确要求才删除本地数据库。

宿主 Agent 及其插件可能有独立的隐私政策。本项目只调用用户当前环境已经提供并授权的能力，不扩大权限。

Banpie Daily Chief is local-first. It binds to loopback only, uses a random local token, stores normalized fields rather than raw mail bodies, and does not operate a product cloud, model API, OAuth, IMAP, sync, or push service. Host agents and connectors may have separate privacy policies.

