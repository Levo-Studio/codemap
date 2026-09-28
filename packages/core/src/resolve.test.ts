// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResolver, packageName } from "./resolve.js";

let root: string;

async function project(tree: Record<string, string>) {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return createResolver(root, Object.keys(tree));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-resolve-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolve: TypeScript and JavaScript", () => {
  it("follows relative imports, tsconfig paths and .js written for .ts", async () => {
    const resolver = await project({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
      }),
      "src/app/page.tsx": "",
      "src/lib/db.ts": "",
      "src/lib/stripe.ts": "",
    });
    expect(await resolver.resolve("src/app/page.tsx", "tsx", "@/lib/db")).toEqual({
      kind: "file",
      path: "src/lib/db.ts",
    });
    expect(await resolver.resolve("src/lib/db.ts", "typescript", "./stripe.js")).toEqual({
      kind: "file",
      path: "src/lib/stripe.ts",
    });
  });

  it("names packages by their package name, installed or not, and leaves Node's own modules out", async () => {
    const resolver = await project({ "a.ts": "" });
    expect(await resolver.resolve("a.ts", "typescript", "stripe/lib/errors")).toEqual({
      kind: "package",
      name: "stripe",
    });
    expect(await resolver.resolve("a.ts", "typescript", "@prisma/client")).toEqual({
      kind: "package",
      name: "@prisma/client",
    });
    expect(await resolver.resolve("a.ts", "typescript", "node:fs")).toEqual({ kind: "standard" });
    expect(await resolver.resolve("a.ts", "typescript", "path")).toEqual({ kind: "standard" });
  });

  it("reports a relative import that leads nowhere", async () => {
    const resolver = await project({ "a.ts": "" });
    expect(await resolver.resolve("a.ts", "typescript", "./missing")).toEqual({
      kind: "unresolved",
    });
  });
});

describe("resolve: Python", () => {
  it("resolves modules and packages from the root and src/, and relative imports from the package", async () => {
    const resolver = await project({
      "src/billing/__init__.py": "",
      "src/billing/stripe.py": "",
      "src/billing/jobs/retry.py": "",
      "app.py": "",
    });
    expect(await resolver.resolve("app.py", "python", "billing.stripe")).toEqual({
      kind: "file",
      path: "src/billing/stripe.py",
    });
    expect(await resolver.resolve("app.py", "python", "billing")).toEqual({
      kind: "file",
      path: "src/billing/__init__.py",
    });
    expect(await resolver.resolve("src/billing/jobs/retry.py", "python", "..stripe")).toEqual({
      kind: "file",
      path: "src/billing/stripe.py",
    });
  });

  it("tells the standard library from dependencies", async () => {
    const resolver = await project({ "app.py": "" });
    expect(await resolver.resolve("app.py", "python", "os.path")).toEqual({ kind: "standard" });
    expect(await resolver.resolve("app.py", "python", "stripe.error")).toEqual({
      kind: "package",
      name: "stripe",
    });
  });
});

describe("resolve: Go", () => {
  it("maps the module's own paths to package directories, and tells the standard library from dependencies", async () => {
    const resolver = await project({
      "go.mod": "module example.com/ledger\n\ngo 1.22\n",
      "main.go": "",
      "billing/charge.go": "",
    });
    expect(await resolver.resolve("main.go", "go", "example.com/ledger/billing")).toEqual({
      kind: "directory",
      path: "billing",
    });
    expect(await resolver.resolve("main.go", "go", "net/http")).toEqual({ kind: "standard" });
    expect(
      await resolver.resolve("main.go", "go", "github.com/stripe/stripe-go/v76/charge"),
    ).toEqual({
      kind: "package",
      name: "github.com/stripe/stripe-go",
    });
  });
});

describe("packageName", () => {
  it("keeps the scope of a scoped package", () => {
    expect(packageName("@scope/name/deep/path")).toBe("@scope/name");
    expect(packageName("react-dom/client")).toBe("react-dom");
  });
});
