# 贡献指南

欢迎提交修复、文档、翻译和数据源适配器。请先开 Issue 描述用户场景和能力标识，避免把提供商逻辑堆进核心。

## 本地检查

```bash
npm install
npm run check
npm run package:release
```

Pull Request 必须说明：改变了哪个契约、如何降级、是否新增外部写入、测试证据和跨平台影响。适配器只能获取数据并生成 `SourceSnapshot`；排序、容量和校验留在 `@banpie/daily-chief-core`。

不要提交个人任务、邮件正文、OAuth 状态、Cookie、API Key、绝对用户路径或真实运行日志。测试使用合成夹具。

