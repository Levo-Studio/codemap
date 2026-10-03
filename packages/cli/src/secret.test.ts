// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheSecret } from "./secret.js";

const reading = vi.hoisted(() => ({ held: undefined as Promise<void> | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    readFile: async (...args: Parameters<typeof real.readFile>) => {
      const text = await real.readFile(...args);
      const held = reading.held;
      reading.held = undefined;
      await held;
      return text;
    },
  };
});

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

  it("is the same for two Codemaps that start at once for the first time", async () => {
    const env = { XDG_CONFIG_HOME: config };
    const [one, two] = await Promise.all([cacheSecret(env), cacheSecret(env)]);
    expect(one).toBe(two);
    expect(await cacheSecret(env)).toBe(one);
    // Nothing is left beside it.
    expect(await readdir(join(config, "codemap"))).toEqual(["cache-secret"]);
  });

  it("is the same for two Codemaps that start at once where the one kept does not read", async () => {
    await mkdir(join(config, "codemap"));
    for (let run = 0; run < 10; run++) {
      await writeFile(join(config, "codemap/cache-secret"), "not a secret\n");
      const env = { XDG_CONFIG_HOME: config };
      const [one, two] = await Promise.all([cacheSecret(env), cacheSecret(env)]);
      expect(one).toBe(two);
    }
  });

  it("is the same for a Codemap that read the unreadable one before another replaced it", async () => {
    await mkdir(join(config, "codemap"));
    await writeFile(join(config, "codemap/cache-secret"), "not a secret\n");
    const env = { XDG_CONFIG_HOME: config };
    let release = () => {};
    reading.held = new Promise((resolve) => {
      release = resolve;
    });
    const late = cacheSecret(env);
    await vi.waitFor(() => expect(reading.held).toBeUndefined());
    const first = await cacheSecret(env);
    release();
    expect(await late).toBe(first);
    expect(await cacheSecret(env)).toBe(first);
    expect(await readdir(join(config, "codemap"))).toEqual(["cache-secret"]);
  });

  it("is kept where the file system has no second names for a file", async () => {
    const env = { XDG_CONFIG_HOME: config };
    const noLinks = async () => {
      throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
    };
    const first = await cacheSecret(env, noLinks);
    expect(await cacheSecret(env, noLinks)).toBe(first);
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
