# Banpie Daily Chief

A local-first, host-agnostic daily planning assistant. It normalizes calendars, tasks, actionable mail and manual input, selects a small number of realistic actions, creates non-overlapping time blocks, and reports source failures honestly.

Current stable release: `1.0.2`. Automated, cross-platform artifact, dual-host natural-language and native-schedule, degradation, and security acceptance checks have passed. See the [1.0.2 acceptance report](docs/verification/1.0.2-evidence.md).

## Agent-first installation

Paste this into an agent that can run local commands:

> Install and configure “Banpie Daily Chief”. Run diagnostics first. Do not connect to or modify external data. After the local preview succeeds, ask before enabling a daily scheduled run.

No task app, API key, task OS, mail plugin, or cloud account is required. The built-in inbox and task database are enough for a complete first plan.

Download the generic Skill, WorkBuddy package, or Codex package from [GitHub Releases](https://github.com/banpie/banpie-daily-chief/releases). The included installer downloads a platform-specific, SHA-256-verified runtime into the local application-data directory; it does not build the project on the user's machine and the user does not need to open a terminal.

## Key properties

- Local inbox, tasks and projects backed by SQLite.
- One versioned `DailyBrief` renders both the web UI and chat Markdown.
- At most five actions, no past or overlapping blocks, explicit hard deadlines, and at least 20% buffer.
- Source states remain explicit: connected, not connected, login required, read failed, stale, or not read.
- External calendar, mail and task sources are read-only. Only local tasks can be edited.
- WorkBuddy, Codex, and generic `SKILL.md` packages share the same core.

## Developer setup

```bash
git clone https://github.com/banpie/banpie-daily-chief.git
cd banpie-daily-chief
npm install
npm run check
node packages/cli/dist/index.js serve
```

The project uses TypeScript, Node.js 20+, SQLite, React, Zod JSON Schema, and Apache 2.0. See [adapter development](docs/adapter-development.md), [privacy](PRIVACY.md), and [security](SECURITY.md).

The npm package layout for `@banpie/daily-chief-core` and the CLI is complete and passes `npm pack`. Agent installation defaults to SHA-256-verified artifacts from a pinned GitHub release.
