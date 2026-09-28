// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { FileNode, Graph } from "./graph.js";
import { languageOf } from "./languages.js";
import type { SymbolKind } from "./parse.js";
import { columnOf, humanize, placement, structure } from "./structure.js";

function file(
  path: string,
  extra: { packages?: string[]; directives?: string[]; kinds?: SymbolKind[] } = {},
): FileNode {
  const language = languageOf(path);
  if (!language) throw new Error(path);
  return {
    path,
    language,
    lines: 10,
    symbols: (extra.kinds ?? []).map((kind, i) => ({
      name: `s${i}`,
      kind,
      startLine: 1,
      endLine: 2,
      exported: true,
    })),
    directives: extra.directives ?? [],
    packages: extra.packages ?? [],
  };
}

const graphOf = (files: FileNode[]): Graph => ({
  files: new Map(files.map((f) => [f.path, f])),
  imports: [],
  calls: [],
  packageCalls: [],
});

describe("placement", () => {
  it("splits Next.js' app/ into API, route groups and the rest of the frontend", () => {
    expect(placement("src/app/api/stripe/route.ts", 0)).toMatchObject({
      area: "src/app/api",
      name: "API",
      column: "api",
    });
    expect(placement("app/(dashboard)/billing/page.tsx", 0)).toMatchObject({
      area: "app/(dashboard)",
      name: "Dashboard",
      column: "entry",
    });
    expect(placement("app/layout.tsx", 0)).toMatchObject({
      area: "app",
      name: "Frontend",
      column: "entry",
    });
  });

  it("splits container folders one level deeper", () => {
    expect(placement("src/lib/stripe.ts", 0)).toMatchObject({
      area: "src/lib/stripe",
      name: "Stripe",
    });
    expect(placement("lib/billing/invoices.ts", 0)).toMatchObject({
      area: "lib/billing",
      name: "Billing",
    });
  });

  it("makes each package of a monorepo an area", () => {
    expect(placement("packages/core/src/x.ts", 2)).toMatchObject({
      area: "packages/core",
      name: "Core",
      depth: 3,
    });
  });

  it("puts loose files at the root together, and config files apart", () => {
    expect(placement("middleware.ts", 0)).toMatchObject({ area: "project" });
    expect(placement("next.config.mjs", 0)).toMatchObject({ area: "config", name: "Config" });
  });
});

describe("columnOf", () => {
  it("reads API from routes, server actions and server frameworks", () => {
    expect(columnOf(file("app/api/users/route.ts"))).toBe("api");
    expect(columnOf(file("lib/actions.ts", { directives: ["use server"] }))).toBe("api");
    expect(columnOf(file("server.py", { packages: ["fastapi"] }))).toBe("api");
  });

  it("reads data from database and email libraries and data folders", () => {
    expect(columnOf(file("lib/db.ts", { packages: ["@prisma/client"] }))).toBe("data");
    expect(columnOf(file("lib/email.ts", { packages: ["resend"] }))).toBe("data");
    expect(columnOf(file("db/schema.ts"))).toBe("data");
  });

  it("reads entry from components and entry points, and features from the rest", () => {
    expect(columnOf(file("components/card.tsx", { kinds: ["component"] }))).toBe("entry");
    expect(columnOf(file("cmd/server/main.go"))).toBe("entry");
    expect(columnOf(file("lib/billing/plans.ts"))).toBe("features");
  });
});

describe("structure", () => {
  it("groups files into areas and modules, and services into external nodes", () => {
    const result = structure(
      graphOf([
        file("app/api/webhooks/stripe/route.ts", { packages: ["stripe"] }),
        file("app/(dashboard)/billing/page.tsx", { kinds: ["component"] }),
        file("lib/db.ts", { packages: ["@prisma/client"] }),
        file("lib/billing/plans.ts"),
        file("lib/billing/invoices/sync.ts"),
      ]),
    );
    expect(result.areas.map((a) => [a.id, a.name, a.column, a.modules.map((m) => m.name)])).toEqual(
      [
        ["app/(dashboard)", "Dashboard", "entry", ["Billing"]],
        ["app/api", "API", "api", ["Webhooks"]],
        ["lib/billing", "Billing", "features", ["Invoices", "Plans"]],
        ["lib/db", "Database", "data", ["Database"]],
      ],
    );
    expect(result.externals).toEqual([
      { id: "external:Stripe", name: "Stripe", packages: ["stripe"] },
      { id: "external:Prisma", name: "Prisma", packages: ["@prisma/client"] },
    ]);
  });
});

describe("structure: names", () => {
  it("tells same-named areas apart by the folder they sit in", () => {
    const result = structure(
      graphOf([file("app/(auth)/login/page.tsx"), file("lib/auth.ts"), file("pages/api/auth.ts")]),
    );
    expect(result.areas.map((a) => a.name)).toEqual(["Auth (App)", "Auth (Lib)", "API"]);
  });

  it("gives no module the id of an area", () => {
    const result = structure(
      graphOf([file("app/page.tsx"), file("app/api.ts"), file("app/api/x/route.ts")]),
    );
    const areas = result.areas.map((a) => a.id);
    const modules = result.areas.flatMap((a) => a.modules.map((m) => m.id));
    expect(areas).toContain("app/api");
    expect(modules.filter((id) => areas.includes(id))).toEqual([]);
    expect(result.moduleOf.get("app/api.ts")).toBe("app/api/");
    expect(result.areas.find((a) => a.id === "app")?.modules.map((m) => m.id)).toContain(
      "app/api/",
    );
  });
});

describe("humanize", () => {
  it("turns folder and file names into names for people", () => {
    expect(humanize("billing-webhooks")).toBe("Billing Webhooks");
    expect(humanize("(marketing)")).toBe("Marketing");
    expect(humanize("[slug]")).toBe("Slug");
    expect(humanize("[...slug]")).toBe("Slug");
    expect(humanize("userSettings.ts")).toBe("User Settings");
    expect(humanize("db")).toBe("Database");
    expect(humanize("licenses.test.mjs")).toBe("Licenses Test");
  });
});
