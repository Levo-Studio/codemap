// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { ALLOWED, findViolations, parseReport } from "./licenses.mjs";

/** @param {"--prod" | "--dev"} selection */
function report(selection) {
  return parseReport(
    execFileSync("pnpm", ["licenses", "list", "--json", selection], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

const violations = [
  ...findViolations(report("--prod"), ALLOWED),
  ...findViolations(report("--dev"), ALLOWED),
];

for (const { name, version, license } of violations) {
  process.stderr.write(`${name}@${version}: ${license}\n`);
}
if (violations.length > 0) {
  process.stderr.write(`${violations.length} dependencies with a licence that is not allowed.\n`);
  process.exit(1);
}
