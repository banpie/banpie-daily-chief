# 安装、升级与卸载

## Agent 自动安装

Agent 先运行 `node --version`，确认 Node.js 20+，再安装固定版本 CLI、运行 doctor、启动网页。首次预览前不连接外部数据。只有用户同意才创建宿主调度。

```bash
npm install --global @banpie/daily-chief-cli@0.3.0-beta.1
daily-chief doctor --json
daily-chief serve
```

预览版若 npm 包尚不可用，通用 Skill 与两个插件包都包含 `scripts/install.mjs`。Agent 在 Skill 目录执行下面命令即可从固定 GitHub 标签安装；用户不需要打开终端：

```bash
node scripts/install.mjs
node scripts/bridge.mjs doctor --json
node scripts/bridge.mjs serve
```

安装器只写入应用数据目录下的版本化 `runtime/`，不触碰任务数据库。它不会登录任何外部服务，也不会创建系统定时器。

Windows 使用同一命令；数据默认进入 `%LOCALAPPDATA%\BanpieDailyChief`。macOS 数据默认进入 `~/Library/Application Support/BanpieDailyChief`。Linux 默认使用 `$XDG_DATA_HOME/banpie-daily-chief`。

## 升级

先备份本地数据库，再安装新版本并运行 `daily-chief doctor --json`。数据库迁移只向前追加，升级失败时保留原数据库。预览版升级应阅读 CHANGELOG。

## 卸载

```bash
npm uninstall --global @banpie/daily-chief-cli
node scripts/install.mjs --uninstall
```

卸载 CLI 不删除任务数据库。只有用户明确要求清除数据时，Agent 才展示精确数据目录并再次确认删除范围。
