// SPDX-License-Identifier: Apache-2.0

import { readFile, realpath } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join, posix, relative } from "node:path";
import { ResolverFactory } from "oxc-resolver";
import type { LanguageId } from "./languages.js";
import { toPosix } from "./paths.js";
import { pythonStandardModules } from "./python-standard.js";

export type Target =
  | { kind: "file"; path: string }
  | { kind: "directory"; path: string }
  | { kind: "package"; name: string }
  | { kind: "standard" }
  | { kind: "unresolved" };

export interface Resolver {
  resolve(from: string, language: LanguageId, specifier: string): Promise<Target>;
}

export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

const nodeBuiltins = new Set(builtinModules);
const isNodeBuiltin = (specifier: string) =>
  specifier.startsWith("node:") || nodeBuiltins.has(specifier.split("/")[0] ?? "");

// oxc-resolver returns real paths, so the root is made real.
function scriptResolver(root: string, files: ReadonlySet<string>) {
  const factory = new ResolverFactory({
    tsconfig: "auto",
    extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    },
    conditionNames: ["import", "require", "node", "default"],
    mainFields: ["module", "main"],
  });
  return async (from: string, specifier: string): Promise<Target> => {
    if (isNodeBuiltin(specifier)) return { kind: "standard" };
    const result = await factory.resolveFileAsync(join(root, from), specifier);
    if (result.path) {
      const path = toPosix(relative(root, result.path));
      if (!path.startsWith("..") && !path.split("/").includes("node_modules") && files.has(path)) {
        return { kind: "file", path };
      }
      if (!specifier.startsWith(".") && !specifier.startsWith("/"))
        return { kind: "package", name: packageName(specifier) };
      return { kind: "unresolved" };
    }
    // A bare specifier that fails to resolve is a package.
    if (!specifier.startsWith(".") && !specifier.startsWith("/"))
      return { kind: "package", name: packageName(specifier) };
    return { kind: "unresolved" };
  };
}

// Relative imports start from the importing file's package.
function pythonResolver(files: ReadonlySet<string>) {
  const roots = ["", "src"];
  return (from: string, specifier: string): Target => {
    const candidates: string[] = [];
    if (specifier.startsWith(".")) {
      const dots = specifier.match(/^\.+/)?.[0].length ?? 1;
      let base = posix.dirname(from);
      for (let i = 1; i < dots; i++) base = posix.dirname(base);
      const rest = specifier.slice(dots).split(".").filter(Boolean).join("/");
      const module = rest ? posix.join(base, rest) : base;
      candidates.push(`${module}.py`, `${module}/__init__.py`);
    } else {
      const module = specifier.split(".").join("/");
      for (const root of roots) {
        const at = root ? `${root}/${module}` : module;
        candidates.push(`${at}.py`, `${at}/__init__.py`);
      }
    }
    const found = candidates.find((path) => files.has(path));
    if (found) return { kind: "file", path: found };
    if (specifier.startsWith(".")) return { kind: "unresolved" };
    const top = specifier.split(".")[0] ?? specifier;
    return pythonStandardModules.has(top) ? { kind: "standard" } : { kind: "package", name: top };
  };
}

// A first element without a dot means the standard library.
function goResolver(module: string | undefined, directories: ReadonlySet<string>) {
  return (specifier: string): Target => {
    if (module && (specifier === module || specifier.startsWith(`${module}/`))) {
      const path = specifier === module ? "" : specifier.slice(module.length + 1);
      return directories.has(path) ? { kind: "directory", path } : { kind: "unresolved" };
    }
    if (!(specifier.split("/")[0] ?? "").includes(".")) return { kind: "standard" };
    return { kind: "package", name: specifier.split("/").slice(0, 3).join("/") };
  };
}

async function goModule(root: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(root, "go.mod"), "utf8");
    return text.match(/^module\s+(\S+)/m)?.[1];
  } catch {
    return undefined;
  }
}

export async function createResolver(root: string, paths: readonly string[]): Promise<Resolver> {
  const files = new Set(paths);
  const directories = new Set(
    paths.filter((p) => p.endsWith(".go")).map((p) => posix.dirname(p).replace(/^\.$/, "")),
  );
  const script = scriptResolver(await realpath(root), files);
  const python = pythonResolver(files);
  const go = goResolver(await goModule(root), directories);
  return {
    async resolve(from, language, specifier) {
      switch (language) {
        case "typescript":
        case "tsx":
        case "javascript":
          return script(from, specifier);
        case "python":
          return python(from, specifier);
        case "go":
          return go(specifier);
      }
    },
  };
}
