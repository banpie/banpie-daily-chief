import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sourceSkill = resolve("skills/banpie-daily-chief");
const sourceBridge = resolve("scripts/bridge.mjs");
const sourceInstaller = resolve("skills/banpie-daily-chief/scripts/install.mjs");
const targets = [
  resolve("plugins/codex/banpie-daily-chief"),
  resolve("plugins/workbuddy/banpie-daily-chief")
];

for (const target of targets) {
  const skillTarget = resolve(target, "skills/banpie-daily-chief");
  rmSync(skillTarget, { recursive: true, force: true });
  mkdirSync(resolve(target, "skills"), { recursive: true });
  cpSync(sourceSkill, skillTarget, { recursive: true });
  mkdirSync(resolve(target, "scripts"), { recursive: true });
  cpSync(sourceBridge, resolve(target, "scripts/bridge.mjs"));
  cpSync(sourceInstaller, resolve(target, "scripts/install.mjs"));
}
