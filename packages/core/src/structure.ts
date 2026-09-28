// SPDX-License-Identifier: Apache-2.0

import type { FileNode, Graph } from "./graph.js";
import { serviceOf } from "./services.js";

// The map's grouping: the project's files into areas and modules, the areas
// into the system columns of the design (Entry → API → Features → Data &
// Services), and the services the code talks to into external nodes. It is a
// reading of folder structure and framework conventions, not a claim about
// intent, and every rule is here so it can be read and argued with.

export type Column = "entry" | "api" | "features" | "data";

export interface Module {
  id: string;
  name: string;
  files: string[];
}

export interface Area {
  id: string;
  name: string;
  column: Column;
  files: string[];
  modules: Module[];
}

export interface External {
  id: string;
  name: string;
  packages: string[];
}

export interface Structure {
  areas: Area[];
  externals: External[];
  // Which area each file is in, and which module.
  areaOf: Map<string, string>;
  moduleOf: Map<string, string>;
}

// Folders that hold unrelated things side by side. Their children are the
// areas, not the folder itself: lib/stripe.ts and lib/db.ts are not one area.
const containers = new Set([
  "lib",
  "libs",
  "utils",
  "util",
  "server",
  "services",
  "core",
  "shared",
  "common",
  "internal",
  "pkg",
  "helpers",
]);

// Monorepo package folders: each package in them is an area of its own.
const workspaces = new Set(["apps", "packages"]);

// Only a source file's own extension is dropped: licenses.test.mjs is
// "Licenses Test", not a second "Licenses".
const sourceExtension = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go)$/;

const words: Record<string, string> = {
  api: "API",
  db: "Database",
  ui: "UI",
  auth: "Auth",
  cli: "CLI",
  cmd: "Commands",
};

// "billing-webhooks" → "Billing Webhooks", "db" → "Database".
export function humanize(segment: string): string {
  // Route groups "(marketing)" and dynamic segments "[slug]", "[...slug]"
  // are named by what is inside the brackets.
  const stem = segment
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\[+(?:\.\.\.)?(.*?)\]+$/, "$1")
    .replace(sourceExtension, "");
  const lower = stem.toLowerCase();
  if (words[lower]) return words[lower];
  return stem
    .split(/[-_.\s]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => words[w.toLowerCase()] ?? w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

interface Placement {
  area: string;
  name: string;
  // An area whose kind the folder already says; otherwise the files decide.
  column?: Column;
  // Where the area's own folder ends, so modules can be read after it.
  depth: number;
}

// Where a file's area is. The rules, in order: a monorepo package is an area;
// a leading src/ is skipped; Next.js' app/ and pages/ split into API, route
// groups and the rest of the frontend; container folders split one level
// deeper; anything else is the area of its first folder.
export function placement(path: string, workspaceDepth: number): Placement {
  const parts = path.split("/");
  let at = 0;
  if (workspaceDepth > 0 && workspaces.has(parts[0] ?? "") && parts.length > 2) {
    // Inside a package, a src/ folder is skipped like at the root.
    const depth = parts[2] === "src" && parts.length > 3 ? 3 : 2;
    return { area: parts.slice(0, 2).join("/"), name: humanize(parts[1] ?? ""), depth };
  }
  if (parts[at] === "src" && parts.length > at + 1) at++;
  const first = parts[at] ?? "";
  if (parts.length === at + 1) {
    return /\.config\.[^.]+$/.test(first)
      ? { area: "config", name: "Config", column: "features", depth: at }
      : { area: "project", name: "Project", depth: at };
  }
  const base = parts.slice(0, at + 1).join("/");
  if (first === "app" || first === "pages") {
    const second = parts[at + 1] ?? "";
    if (second === "api") return { area: `${base}/api`, name: "API", column: "api", depth: at + 2 };
    if (/^\(.+\)$/.test(second) && parts.length > at + 2) {
      return { area: `${base}/${second}`, name: humanize(second), column: "entry", depth: at + 2 };
    }
    return { area: base, name: "Frontend", column: "entry", depth: at + 1 };
  }
  if (containers.has(first) && parts.length > at + 2) {
    const child = parts[at + 1] ?? "";
    return { area: `${base}/${child}`, name: humanize(child), depth: at + 2 };
  }
  // A file directly in a container is an area of its own; lib/db.ts and a
  // lib/db/ folder are the same area.
  if (containers.has(first)) {
    const child = (parts[at + 1] ?? "").replace(/\.[^.]+$/, "");
    return { area: `${base}/${child}`, name: humanize(child), depth: at + 1 };
  }
  if (first === "cmd") return { area: base, name: humanize(first), column: "entry", depth: at + 1 };
  return { area: base, name: humanize(first), depth: at + 1 };
}

const apiFrameworks = new Set([
  "express",
  "hono",
  "fastify",
  "koa",
  "fastapi",
  "flask",
  "django",
  "github.com/gin-gonic/gin",
  "github.com/go-chi/chi",
  "github.com/labstack/echo",
  "github.com/gofiber/fiber",
]);
const dataFolders = /(^|\/)(prisma|db|database|models|migrations|schema|drizzle)(\/|$)/;
const uiFolders = /(^|\/)(components|app|pages|views|ui)(\/|$)/;

// What kind of code a file is, from what it uses and where it sits.
export function columnOf(file: FileNode): Column {
  if (/(^|\/)api\//.test(file.path) || /(^|\/)route\.(ts|js)$/.test(file.path)) return "api";
  if (file.directives.includes("use server")) return "api";
  if (file.packages.some((p) => apiFrameworks.has(p))) return "api";
  if (file.packages.some((p) => serviceOf(p)?.data) || dataFolders.test(file.path)) return "data";
  if (file.symbols.some((s) => s.kind === "component") || file.directives.includes("use client"))
    return "entry";
  if (uiFolders.test(file.path) && /\.(tsx|jsx)$/.test(file.path)) return "entry";
  if (/(^|\/)(main\.go|__main__\.py|manage\.py)$/.test(file.path)) return "entry";
  return "features";
}

const order: Column[] = ["api", "data", "entry", "features"];

// The column most of an area's files are in; ties go to the more specific
// kind, API before data before entry before features.
function majority(columns: Column[]): Column {
  const counts = new Map<Column, number>();
  for (const c of columns) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: Column = "features";
  let most = 0;
  for (const c of order) {
    const n = counts.get(c) ?? 0;
    if (n > most) {
      best = c;
      most = n;
    }
  }
  return best;
}

export function structure(graph: Graph): Structure {
  const paths = [...graph.files.keys()].sort();
  const packagesInWorkspaces = new Set(
    paths
      .filter((p) => workspaces.has(p.split("/")[0] ?? "") && p.split("/").length > 2)
      .map((p) => p.split("/").slice(0, 2).join("/")),
  );
  // A single app under apps/ is not a monorepo worth splitting by package.
  const workspaceDepth = packagesInWorkspaces.size > 1 ? 2 : 0;

  const areas = new Map<string, Area & { columns: Column[]; depth: number; forced?: Column }>();
  const areaOf = new Map<string, string>();
  const moduleOf = new Map<string, string>();

  for (const path of paths) {
    const file = graph.files.get(path) as FileNode;
    const place = placement(path, workspaceDepth);
    let area = areas.get(place.area);
    if (!area) {
      area = {
        id: place.area,
        name: place.name,
        column: "features",
        files: [],
        modules: [],
        columns: [],
        depth: place.depth,
        ...(place.column ? { forced: place.column } : {}),
      };
      areas.set(place.area, area);
    }
    area.files.push(path);
    area.columns.push(columnOf(file));
    areaOf.set(path, place.area);

    // A module is the next folder inside the area, or a file on its own.
    const rest = path.split("/").slice(place.depth);
    const moduleKey =
      rest.length > 1 ? (rest[0] ?? "") : (rest[0] ?? "").replace(sourceExtension, "");
    const moduleId = `${place.area}/${moduleKey}`;
    let module = area.modules.find((m) => m.id === moduleId);
    if (!module) {
      module = { id: moduleId, name: humanize(moduleKey), files: [] };
      area.modules.push(module);
    }
    module.files.push(path);
    moduleOf.set(path, moduleId);
  }

  // Two areas must not share a name on the map. Same-named areas are told
  // apart by the folder they sit in: "Auth (App)" and "Auth (Lib)".
  const named = new Map<string, (typeof areas extends Map<string, infer A> ? A : never)[]>();
  for (const area of areas.values()) named.set(area.name, [...(named.get(area.name) ?? []), area]);
  for (const group of named.values()) {
    if (group.length < 2) continue;
    for (const area of group) {
      const parts = area.id.split("/");
      const folder =
        parts.find((part, i) => group.some((other) => other.id.split("/")[i] !== part)) ?? area.id;
      area.name = `${area.name} (${humanize(folder)})`;
    }
  }

  const externals = new Map<string, External>();
  for (const file of graph.files.values()) {
    for (const name of file.packages) {
      const service = serviceOf(name);
      if (!service) continue;
      const id = `external:${service.name}`;
      const external = externals.get(id) ?? { id, name: service.name, packages: [] };
      if (!external.packages.includes(name)) external.packages.push(name);
      externals.set(id, external);
    }
  }

  // Every node is on one map, so no module may share an id with an area:
  // app/api.ts is the module app/api of the frontend, and app/api/ the area
  // of the routes. Such a module's id ends in a slash, which no area's does.
  for (const area of areas.values())
    for (const module of area.modules) {
      if (!areas.has(module.id)) continue;
      const own = `${module.id}/`;
      for (const path of module.files) moduleOf.set(path, own);
      module.id = own;
    }

  return {
    areas: [...areas.values()].map(({ columns, depth: _depth, forced, ...area }) => ({
      ...area,
      column: forced ?? majority(columns),
    })),
    externals: [...externals.values()],
    areaOf,
    moduleOf,
  };
}
