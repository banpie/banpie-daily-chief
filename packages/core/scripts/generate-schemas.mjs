import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  candidateSchema,
  capabilityReportSchema,
  dailyBriefSchema,
  dailyPlanSchema,
  onboardingStateSchema,
  projectSchema,
  settingsSchema,
  sourceSnapshotSchema,
  taskSchema
} from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "schemas/v1");
const schemas = {
  Candidate: candidateSchema,
  CapabilityReport: capabilityReportSchema,
  DailyBrief: dailyBriefSchema,
  DailyPlan: dailyPlanSchema,
  OnboardingState: onboardingStateSchema,
  Project: projectSchema,
  Settings: settingsSchema,
  SourceSnapshot: sourceSnapshotSchema,
  Task: taskSchema
};

mkdirSync(outputDirectory, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const output = z.toJSONSchema(schema, { target: "draft-2020-12" });
  output.$id = `https://schemas.banpie.info/daily-chief/v1/${name}.schema.json`;
  writeFileSync(resolve(outputDirectory, `${name}.schema.json`), `${JSON.stringify(output, null, 2)}\n`);
}
