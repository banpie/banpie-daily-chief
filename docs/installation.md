# 安装、升级与卸载

## 普通用户：把一句话交给 Agent

已经安装并登录 Codex 或 WorkBuddy 的用户，不需要打开终端。把下面这段话发送给 Agent：

> 帮我安装并配置“半撇每日参谋”，先体检，不要连接或修改任何外部数据，预览成功后再询问我是否启用每日运行。

Agent 应先从本仓库市场安装插件，再运行包内安装器。安装器会选择 macOS arm64/x64 或 Windows x64 的预构建运行时、核对 SHA-256、解压后实际启动自检，并保留独立的用户数据库。

## Agent 执行入口

### Codex

```bash
codex plugin marketplace add banpie/banpie-daily-chief
codex plugin add banpie-daily-chief@banpie
```

### WorkBuddy

```bash
codebuddy plugin marketplace add banpie/banpie-daily-chief --name banpie
codebuddy plugin install banpie-daily-chief@banpie --scope user
```

### 通用 Skill 或离线包

从 [GitHub Releases](https://github.com/banpie/banpie-daily-chief/releases) 取得对应压缩包后，Agent 在包内运行：

```bash
node scripts/install.mjs
node scripts/bridge.mjs doctor --json --host-report <capability-report.json>
node scripts/bridge.mjs serve --host-report <capability-report.json>
```

如果当前宿主没有提供真实能力报告，`doctor` 必须显示 `Current host unknown`，不能从浏览器或目录名猜测宿主。首次预览前不登录、不连接、不修改外部数据；只有用户接受预览后才创建宿主原生定时任务。

安装器只更新应用数据目录下的版本化 `runtime/`。macOS 用户数据默认在 `~/Library/Application Support/BanpieDailyChief`，Windows 默认在 `%LOCALAPPDATA%\BanpieDailyChief`。WorkBuddy 可以把运行时放入插件数据目录，但任务数据库仍使用上述独立目录，插件升级不会删除任务。

## 开发者安装

源码和 npm 安装只面向开发者，不是新人路径：

```bash
npm install --global @banpie/daily-chief-cli@1.0.1
daily-chief doctor --json
daily-chief serve
```

## 升级与失败恢复

安装器先把新版本解压到候选目录，完成版本与启动自检后才切换。若下载、校验、解压或自检失败，旧运行时继续可用；SQLite 迁移只向前追加，用户数据库不会被替换。

## 卸载

Agent 可以运行：

```bash
node scripts/install.mjs --uninstall
```

卸载只移除当前版本运行时，不删除任务数据库。只有用户明确要求清除数据时，才展示精确数据目录并再次确认删除范围。
