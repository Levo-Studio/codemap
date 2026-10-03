// SPDX-License-Identifier: Apache-2.0

import type { FileNode, Graph } from "./graph.js";
import { kindId } from "./ids.js";
import { serviceOf } from "./services.js";
import { en } from "./strings/en.js";

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
  areaOf: Map<string, string>;
  moduleOf: Map<string, string>;
}

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

const workspaces = new Set(["apps", "packages"]);

const sourceExtension = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go)$/;

const words: Readonly<Record<string, string>> = en.areas.words;

const insideBrackets = (segment: string) =>
  segment.replace(/^\((.*)\)$/, "$1").replace(/^\[+(?:\.\.\.)?(.*?)\]+$/, "$1");

// "billing-webhooks" → "Billing Webhooks", "db" → "Database".
export function humanize(segment: string): string {
  const stem = insideBrackets(segment).replace(sourceExtension, "");
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
  column?: Column;
  depth: number;
}

function packagePlacement(parts: string[]): Placement {
  const depth = parts[2] === "src" && parts.length > 3 ? 3 : 2;
  return { area: parts.slice(0, 2).join("/"), name: humanize(parts[1] ?? ""), depth };
}

// lib/db.ts and a lib/db/ folder are the same area.
function containerPlacement(parts: string[], at: number, base: string): Placement {
  if (parts.length > at + 2) {
    const child = parts[at + 1] ?? "";
    return { area: `${base}/${child}`, name: humanize(child), depth: at + 2 };
  }
  const child = (parts[at + 1] ?? "").replace(/\.[^.]+$/, "");
  return { area: `${base}/${child}`, name: humanize(child), depth: at + 1 };
}

// Packages, src/, Next.js app and pages, containers, then first folder.
export function placement(path: string, workspaceDepth: number): Placement {
  const parts = path.split("/");
  let at = 0;
  if (workspaceDepth > 0 && workspaces.has(parts[0] ?? "") && parts.length > 2)
    return packagePlacement(parts);
  if (parts[at] === "src" && parts.length > at + 1) at++;
  const first = parts[at] ?? "";
  if (parts.length === at + 1) {
    return /\.config\.[^.]+$/.test(first)
      ? { area: "config", name: en.areas.config, column: "features", depth: at }
      : { area: "project", name: en.areas.project, depth: at };
  }
  const base = parts.slice(0, at + 1).join("/");
  if (first === "app" || first === "pages") {
    const second = parts[at + 1] ?? "";
    if (second === "api")
      return { area: `${base}/api`, name: en.areas.api, column: "api", depth: at + 2 };
    if (/^\(.+\)$/.test(second) && parts.length > at + 2) {
      return { area: `${base}/${second}`, name: humanize(second), column: "entry", depth: at + 2 };
    }
    return { area: base, name: en.areas.frontend, column: "entry", depth: at + 1 };
  }
  if (containers.has(first)) return containerPlacement(parts, at, base);
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

// Ties go to API, then data, entry, features.
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

type AreaDraft = Area & { columns: Column[]; depth: number; forced?: Column };

// A single app under apps/ is not worth splitting.
function workspaceDepthOf(paths: string[]): number {
  const packagesInWorkspaces = new Set(
    paths
      .filter((p) => workspaces.has(p.split("/")[0] ?? "") && p.split("/").length > 2)
      .map((p) => p.split("/").slice(0, 2).join("/")),
  );
  return packagesInWorkspaces.size > 1 ? 2 : 0;
}

function moduleKeyOf(path: string, areaDepth: number): string {
  const rest = path.split("/").slice(areaDepth);
  return rest.length > 1 ? (rest[0] ?? "") : (rest[0] ?? "").replace(sourceExtension, "");
}

// Same-named areas get their folder: "Auth (App)", "Auth (Lib)".
function nameSameNamedApart(areas: Map<string, AreaDraft>): void {
  const named = new Map<string, AreaDraft[]>();
  for (const area of areas.values()) named.set(area.name, [...(named.get(area.name) ?? []), area]);
  for (const group of named.values()) {
    if (group.length < 2) continue;
    for (const area of group) {
      const parts = area.id.split("/");
      const folder =
        parts.find((part, i) => group.some((other) => other.id.split("/")[i] !== part)) ?? area.id;
      area.name = en.areas.inFolder(area.name, humanize(folder));
    }
  }
}

function externalsOf(graph: Graph): Map<string, External> {
  const externals = new Map<string, External>();
  for (const file of graph.files.values()) {
    for (const name of file.packages) {
      const service = serviceOf(name);
      if (!service) continue;
      const id = kindId("external", service.name);
      const external = externals.get(id) ?? { id, name: service.name, packages: [] };
      if (!external.packages.includes(name)) external.packages.push(name);
      externals.set(id, external);
    }
  }
  return externals;
}

// A module sharing an area's id gets a trailing slash.
function separateModuleIdsFromAreas(
  areas: Map<string, AreaDraft>,
  moduleOf: Map<string, string>,
): void {
  for (const area of areas.values())
    for (const module of area.modules) {
      if (!areas.has(module.id)) continue;
      const own = `${module.id}/`;
      for (const path of module.files) moduleOf.set(path, own);
      module.id = own;
    }
}

export function structure(graph: Graph): Structure {
  const files = [...graph.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const workspaceDepth = workspaceDepthOf(files.map(([path]) => path));
  const areas = new Map<string, AreaDraft>();
  const areaOf = new Map<string, string>();
  const moduleOf = new Map<string, string>();

  for (const [path, file] of files) {
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

    const moduleKey = moduleKeyOf(path, place.depth);
    const moduleId = `${place.area}/${moduleKey}`;
    let module = area.modules.find((m) => m.id === moduleId);
    if (!module) {
      module = { id: moduleId, name: humanize(moduleKey), files: [] };
      area.modules.push(module);
    }
    module.files.push(path);
    moduleOf.set(path, moduleId);
  }

  nameSameNamedApart(areas);
  const externals = externalsOf(graph);
  separateModuleIdsFromAreas(areas, moduleOf);

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
