import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "skills/banpie-daily-chief/SKILL.md",
  "skills/banpie-daily-chief/agents/openai.yaml",
  "plugins/banpie-daily-chief/.codex-plugin/plugin.json",
  "plugins/workbuddy/banpie-daily-chief/.codebuddy-plugin/plugin.json",
  "packages/core/schemas/v1/SourceSnapshot.schema.json",
  "packages/core/schemas/v1/DailyBrief.schema.json",
  "packages/core/schemas/v1/DailyPlan.schema.json",
  "packages/core/schemas/v1/OnboardingState.schema.json",
  "packages/cli/dist/index.js",
  "packages/cli/public/index.html"
];
for (const path of required) {
  if (!statSync(resolve(path)).isFile()) throw new Error(`Missing required artifact: ${path}`);
}

const manifests = [
  JSON.parse(readFileSync(resolve("plugins/banpie-daily-chief/.codex-plugin/plugin.json"), "utf8")),
  JSON.parse(readFileSync(resolve("plugins/workbuddy/banpie-daily-chief/.codebuddy-plugin/plugin.json"), "utf8"))
];
for (const manifest of manifests) {
  if (manifest.name !== "banpie-daily-chief" || manifest.version !== "0.4.0-beta.1") throw new Error("Plugin manifest name/version mismatch.");
}

const installerSource = readFileSync(resolve("skills/banpie-daily-chief/scripts/install.mjs"), "utf8");
if (!installerSource.includes('spawnSync("tar.exe"') || !installerSource.includes('spawnSync("powershell.exe"')) {
  throw new Error("Windows installer must prefer tar.exe and retain the PowerShell compatibility fallback.");
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const validatorPath = resolve("scripts/validate-artifacts.mjs");
const textFiles = walk(resolve(".")).filter((path) => !path.includes("node_modules") && !/[\\/]\.git[\\/]/.test(path) && path !== validatorPath && /\.(md|ts|tsx|js|mjs|json|ya?ml)$/.test(path));
const forbidden = [new RegExp("\\/Users\\/" + "ban" + "pie", "i"), /iCloud~md~obsidian/i, /BEGIN (RSA |OPENSSH )?PRIVATE KEY/i, /gho_[A-Za-z0-9]{20,}/];
for (const path of textFiles) {
  const content = readFileSync(path, "utf8");
  if (content.includes("[TO" + "DO:")) throw new Error(`Placeholder found: ${path}`);
  for (const pattern of forbidden) if (pattern.test(content)) throw new Error(`Personal path or secret pattern found in ${path}: ${pattern}`);
}
process.stdout.write(`Validated ${required.length} required artifacts, ${manifests.length} manifests, and ${textFiles.length} text files.\n`);
