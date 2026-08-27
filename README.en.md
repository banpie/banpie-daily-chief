# Banpie Daily Chief

A local-first, host-agnostic daily planning assistant. It normalizes calendars, tasks, actionable mail and manual input, selects a small number of realistic actions, creates non-overlapping time blocks, and reports source failures honestly.

Current release: `0.3.0-beta.1` public preview. It is not labeled `1.0.0` until fresh macOS/Windows installs and real scheduled runs in WorkBuddy and Codex have passed.

## Agent-first installation

Paste this into an agent that can run local commands:

> Install and configure “Banpie Daily Chief”. Run diagnostics first. Do not connect to or modify external data. After the local preview succeeds, ask before enabling a daily scheduled run.

No task app, API key, task OS, mail plugin, or cloud account is required. The built-in inbox and task database are enough for a complete first plan.

Download the generic Skill, WorkBuddy package, or Codex package from [GitHub Releases](https://github.com/banpie/banpie-daily-chief/releases). The included installer builds the pinned release in the local application-data directory; the user does not need to open a terminal.

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

The npm package layout for `@banpie/daily-chief-core` and the CLI is complete and passes `npm pack`. Until the maintainer finishes the first npm registry login, this preview installs from the pinned GitHub release instead.
