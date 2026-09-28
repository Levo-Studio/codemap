// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Starts the built CLI on a folder, the way a user would, and gives the
// address it prints. Needs the packages built (pnpm build).

const bin = fileURLToPath(new URL("../../cli/dist/bin.js", import.meta.url));

export interface Running {
  address: string;
  stop(): Promise<void>;
}

export function startCodemap(root: string): Promise<Running> {
  // Without explanations: the tests never send code to the user's provider.
  const cli = spawn(process.execPath, [bin, "--no-open", "--no-explain", root], {
    // Playwright sets FORCE_COLOR, which would override NO_COLOR and make
    // Node warn about the pair.
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = new Promise<void>((resolve) => cli.on("exit", () => resolve()));
  return new Promise((resolve, reject) => {
    let output = "";
    cli.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const found = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/);
      if (found)
        resolve({
          address: found[0],
          stop: async () => {
            cli.kill("SIGTERM");
            await exited;
          },
        });
    });
    cli.on("exit", (code) => reject(new Error(`codemap exited with ${code}:\n${output}`)));
  });
}
