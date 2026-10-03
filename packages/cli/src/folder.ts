// SPDX-License-Identifier: Apache-2.0

import { readFileSync, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

// A path that leaves the project is never read.
export function projectReader(root: string): (path: string) => string | undefined {
  const base = resolve(root);
  return (path) => {
    if (!resolve(base, path).startsWith(base + sep)) return undefined;
    try {
      // Links are resolved, so none can point outside the project.
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
