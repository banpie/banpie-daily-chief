import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ZipArchive } from "archiver";

const version = "1.0.2";
const outputDirectory = resolve("release");
mkdirSync(outputDirectory, { recursive: true });

async function zip(name, source) {
  const destination = resolve(outputDirectory, `${name}-${version}.zip`);
  const output = createWriteStream(destination);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const closed = new Promise((resolveClosed, reject) => { output.on("close", resolveClosed); archive.on("error", reject); });
  archive.pipe(output);
  archive.directory(resolve(source), false);
  await archive.finalize();
  await closed;
  return destination;
}

const artifacts = await Promise.all([
  zip("banpie-daily-chief-skill", "skills/banpie-daily-chief"),
  zip("banpie-daily-chief-workbuddy", "plugins/workbuddy/banpie-daily-chief"),
  zip("banpie-daily-chief-codex", "plugins/banpie-daily-chief")
]);
const allArtifacts = readdirSync(outputDirectory).filter((name) => name.endsWith(`-${version}.zip`)).sort().map((name) => resolve(outputDirectory, name));
const checksums = allArtifacts.map((path) => `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${basename(path)}`).join("\n");
writeFileSync(resolve(outputDirectory, "SHA256SUMS"), `${checksums}\n`);
process.stdout.write(`${artifacts.map((path) => basename(path)).join("\n")}\nSHA256SUMS\n`);
