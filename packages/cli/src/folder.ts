// SPDX-License-Identifier: Apache-2.0

import { readFileSync, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

// The folder Codemap is started in, as the CLI reads it outside the analysis:
// whether it is a folder at all, and its files for the panels.

// Reads files of the project for what a panel shows of the code; a path
// that leaves the project is never read.
export function projectReader(root: string): (path: string) => string | undefined {
  const base = resolve(root);
  return (path) => {
    if (!resolve(base, path).startsWith(base + sep)) return undefined;
    try {
      // Where the file really is: a link inside the project that leads out of
      // it would otherwise hand its target to the panels and the provider.
      const home = realpathSync(base);
      const file = realpathSync(resolve(base, path));
      if (!file.startsWith(home + sep)) return undefined;
      return readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  };
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
