import { rmSync } from "node:fs";
import { resolve } from "node:path";

for (const path of ["packages/core/dist", "packages/cli/dist", "packages/cli/public", "apps/web/dist", "release", "coverage"]) {
  rmSync(resolve(path), { recursive: true, force: true });
}

