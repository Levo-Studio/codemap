// SPDX-License-Identifier: Apache-2.0

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, it } from "vitest";
import { run } from "./run.js";

// A terminal that records what is written to it.
function terminal(isTTY: boolean) {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = isTTY;
  let written = "";
  stream.on("data", (chunk: Buffer) => {
    written += chunk.toString();
  });
  return { out: stream as unknown as NodeJS.WriteStream, written: () => written };
}

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    await chmod(folder, 0o755);
    await rm(folder, { recursive: true, force: true });
  }
});

describe("run", () => {
  it("reads a project it may not write to, without a cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-readonly-"));
    folders.push(root);
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    await chmod(root, 0o555);
    const { out } = terminal(false);
    const running = await run({ root, open: false, version: "0.0.0", out, env: {} });
    await running.stop();
  });
});
