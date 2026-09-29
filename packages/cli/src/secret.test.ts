// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheSecret } from "./secret.js";

let config: string;
beforeEach(async () => {
  config = await mkdtemp(join(tmpdir(), "codemap-config-"));
});
afterEach(async () => {
  await rm(config, { recursive: true, force: true });
});

describe("the secret caches are sealed with", () => {
  it("is made once, the user's alone, and the same at every start", async () => {
    const env = { XDG_CONFIG_HOME: config };
    const first = await cacheSecret(env);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await cacheSecret(env)).toBe(first);
    if (process.platform !== "win32")
      expect((await stat(join(config, "codemap/cache-secret"))).mode & 0o777).toBe(0o600);
  });

  it("follows no link put in its place, and is then one for this run only", async () => {
    const outside = join(config, "outside.txt");
    await writeFile(outside, "keep me\n");
    await mkdir(join(config, "codemap"));
    await symlink(outside, join(config, "codemap/cache-secret"));
    const env = { XDG_CONFIG_HOME: config };
    const one = await cacheSecret(env);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(await cacheSecret(env)).not.toBe(one);
    expect(await readFile(outside, "utf8")).toBe("keep me\n");
  });

  it("is one for this run only where it cannot be kept", async () => {
    // A file where its folder would be.
    await writeFile(join(config, "codemap"), "");
    const env = { XDG_CONFIG_HOME: config };
    expect(await cacheSecret(env)).not.toBe(await cacheSecret(env));
  });
});
