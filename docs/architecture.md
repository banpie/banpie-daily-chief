# 架构

```text
宿主插件 / 标准文件 / 人工输入
              │
              ▼
       SourceSnapshot v1
              │
       归一化与稳定去重
              │
              ▼
      DailyBrief JSON v1
        │             │
   聊天 Markdown    本地 React 网页
```

核心层不认识 Gmail、Outlook、Apple 或具体插件名，只认识能力和标准对象。宿主适配器不排序，只转换数据。SQLite 保存本地任务、项目、必要快照、简报和运行记录。

本地服务由 CLI 启动，固定绑定回环地址并用随机令牌保护 API。UI 和 CLI 使用同一数据库与 `DailyBrief`。模型可在宿主中基于确定性基线调整表达，但最终 JSON 必须通过核心校验器。

