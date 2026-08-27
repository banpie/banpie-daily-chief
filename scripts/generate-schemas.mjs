import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  capabilityReportSchema,
  candidateSchema,
  dailyBriefSchema,
  projectSchema,
  sourceSnapshotSchema,
  taskSchema
} from "../packages/core/dist/index.js";

const output = resolve("packages/core/schemas/v1");
mkdirSync(output, { recursive: true });
const schemas = {
  Candidate: candidateSchema,
  SourceSnapshot: sourceSnapshotSchema,
  Task: taskSchema,
  Project: projectSchema,
  DailyBrief: dailyBriefSchema,
  CapabilityReport: capabilityReportSchema
};
for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "ref" });
  json.$id = `https://schemas.banpie.info/daily-chief/v1/${name}.schema.json`;
  writeFileSync(resolve(output, `${name}.schema.json`), `${JSON.stringify(json, null, 2)}\n`);
}

