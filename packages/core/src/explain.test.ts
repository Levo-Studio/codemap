// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyse } from "./analyse.js";
import type { Explanation, ExplanationStore } from "./cache.js";
import { Explainer, readAnswer } from "./explain.js";
import { type Completion, type Provider, ProviderError } from "./providers.js";
import { en } from "./strings/en.js";

let root: string;
const write = async (path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-explain-"));
  await write(
    "lib/billing/charge.ts",
    `import { save } from "../db/save";\nexport function charge() {\n  save();\n}\n`,
  );
  await write("lib/db/save.ts", "export function save() {}\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A provider that answers each thing a prompt asks for, by its "### name",
// with its name and a hash of the whole prompt, so an answer changes with
// what it was asked about; it counts prompts.
function fake(fail?: (prompt: string) => boolean) {
  const prompts: string[] = [];
  const provider: Provider = {
    kind: "anthropic",
    async complete({ prompt }: Completion) {
      prompts.push(prompt);
      if (fail?.(prompt)) throw new Error("rate limited");
      const mark = createHash("sha256").update(prompt).digest("hex").slice(0, 8);
      const names = [...prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
      const answer = Object.fromEntries(
        names.map((name) => [name, { simple: `${name} ${mark}`, technical: `\`${mark}\`` }]),
      );
      return `Here: ${JSON.stringify(answer)}`;
    },
  };
  return { provider, prompts };
}

function memory(): ExplanationStore {
  const kept = new Map<string, Explanation>();
  return { get: (k) => kept.get(k), set: (k, e) => void kept.set(k, e) };
}

const reader = (path: string) => {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
};

describe("Explainer", () => {
  it("explains every function, file, module, area and the system, from the bottom up, several at a time", async () => {
    const { provider, prompts } = fake();
    const explainer = new Explainer(provider, memory(), reader);
    const progress: number[] = [];
    await explainer.explain(await analyse(root), "shop", (p) => progress.push(p.done));
    // A file and its functions in one request, from their code.
    expect(explainer.get("function", "lib/billing/charge.ts#charge")?.simple).toMatch(/^charge /);
    expect(explainer.get("file", "lib/billing/charge.ts")).toBeDefined();
    const file = prompts.find((p) => p.startsWith("Explain the file lib/billing/charge.ts"));
    expect(file).toContain("### charge");
    expect(file).toContain("save();");
    // A module from what its files do.
    const modules = prompts.find((p) => p.startsWith("Explain each module of the area Billing"));
    expect(modules).toContain(explainer.get("file", "lib/billing/charge.ts")?.simple);
    expect(explainer.get("area", "lib/billing")).toBeDefined();
    expect(explainer.get("system", "shop")?.simple).toMatch(/^shop /);
    // Two files, two areas' modules, the areas, the system: six requests for
    // the nine explanations.
    expect(prompts).toHaveLength(6);
    expect(progress.at(-1)).toBe(9);
  });

  it("explains again only what changed, and what reads it", async () => {
    const store = memory();
    const first = fake();
    await new Explainer(first.provider, store, reader).explain(await analyse(root), "shop");
    await write("lib/db/save.ts", "export function save() {\n  return 1;\n}\n");
    const again = fake();
    const explainer = new Explainer(again.provider, store, reader);
    await explainer.explain(await analyse(root), "shop");
    // save changed, so did what it is part of: its file, module, area, the system.
    expect(again.prompts.map((p) => p.split("\n")[0])).toEqual([
      "Explain the file lib/db/save.ts and each of its functions.",
      expect.stringMatching(/^Explain each module of the area /),
      "Explain each area of the app shop from its modules.",
      "Explain the app shop as a whole.",
    ]);
    // Only what changed is asked for: the area of billing is not.
    expect(again.prompts[2]).not.toContain("### lib/billing");
    expect(explainer.get("function", "lib/billing/charge.ts#charge")).toBeDefined();
    expect(await readFile(join(root, "lib/db/save.ts"), "utf8")).toContain("return 1");
  });

  it("asks for nothing when everything is kept", async () => {
    const store = memory();
    await new Explainer(fake().provider, store, reader).explain(await analyse(root), "shop");
    const again = fake();
    const explainer = new Explainer(again.provider, store, reader);
    await explainer.explain(await analyse(root), "shop");
    expect(again.prompts).toEqual([]);
    expect(explainer.get("system", "shop")).toBeDefined();
  });

  it("splits a file with many functions into several requests", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `export function f${i}() {}`).join("\n");
    await write("lib/many.ts", `${many}\n`);
    const { provider, prompts } = fake();
    const explainer = new Explainer(provider, memory(), reader);
    await explainer.explain(await analyse(root), "shop");
    const asked = prompts.filter((p) => p.startsWith("Explain the file lib/many.ts"));
    expect(asked.length).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++)
      expect(explainer.get("function", `lib/many.ts#f${i}`)).toBeDefined();
  });

  it("writes a file with what its functions already explained do", async () => {
    await write(
      "lib/two.ts",
      "export function kept() {}\nexport function changed() {\n  return 1;\n}\n",
    );
    const store = memory();
    await new Explainer(fake().provider, store, reader).explain(await analyse(root), "shop");
    await write(
      "lib/two.ts",
      "export function kept() {}\nexport function changed() {\n  return 2;\n}\n",
    );
    const again = fake();
    const explainer = new Explainer(again.provider, store, reader);
    await explainer.explain(await analyse(root), "shop");
    const file = again.prompts.find((p) => p.startsWith("Explain the file lib/two.ts")) ?? "";
    // kept is not asked for again, but its explanation is there for the file.
    expect(file).not.toContain("### kept");
    expect(file).toContain(`- kept: ${explainer.get("function", "lib/two.ts#kept")?.simple}`);
    expect(file).toContain("### changed");
  });

  it("asks a local model for fewer things at a time", async () => {
    const many = Array.from({ length: 10 }, (_, i) => `export function f${i}() {}`).join("\n");
    await write("lib/many.ts", `${many}\n`);
    const { provider, prompts } = fake();
    const local: Provider = { ...provider, kind: "ollama" };
    await new Explainer(local, memory(), reader).explain(await analyse(root), "shop");
    const asked = prompts.filter((p) => p.startsWith("Explain the file lib/many.ts"));
    // The file and ten functions, at most four in a request.
    expect(asked).toHaveLength(3);
    for (const prompt of asked)
      expect([...prompt.matchAll(/^### /gm)].length).toBeLessThanOrEqual(4);
  });

  it("leaves what failed unexplained and writes the rest from what there is", async () => {
    const { provider } = fake((prompt) => prompt.includes("### save"));
    const explainer = new Explainer(provider, memory(), reader);
    await explainer.explain(await analyse(root), "shop");
    expect(explainer.get("function", "lib/db/save.ts#save")).toBeUndefined();
    expect(explainer.get("function", "lib/billing/charge.ts#charge")).toBeDefined();
    expect(explainer.get("system", "shop")).toBeDefined();
  });
});

describe("Explainer giving up", () => {
  it("sends no more requests once the provider refuses the key, and says why", async () => {
    let requests = 0;
    const provider: Provider = {
      kind: "anthropic",
      complete: async () => {
        requests++;
        throw new ProviderError("invalid x-api-key", 401);
      },
    };
    const result = await new Explainer(provider, memory(), reader).explain(
      await analyse(root),
      "shop",
    );
    expect(result).toEqual({ explained: 0, stopped: "invalid x-api-key" });
    // The four requests already under way when the refusal came, no more.
    expect(requests).toBeLessThanOrEqual(4);
  });

  it("asks again, after a pause, while the provider says it is busy", async () => {
    let busy = 1;
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        if (busy-- > 0) throw new ProviderError("rate_limit_error", 429);
        return inner.provider.complete(completion);
      },
    };
    const paused: number[] = [];
    const explainer = new Explainer(provider, memory(), reader, async (ms) => {
      paused.push(ms);
    });
    const result = await explainer.explain(await analyse(root), "shop");
    expect(result).toEqual({ explained: 9 });
    expect(paused).toEqual([5000]);
    expect(explainer.get("system", "shop")).toBeDefined();
  });

  it("leaves for the next run what stays busy after every pause, without giving up", async () => {
    const provider: Provider = {
      kind: "anthropic",
      complete: async () => {
        throw new ProviderError("overloaded_error", 529);
      },
    };
    const paused: number[] = [];
    const result = await new Explainer(provider, memory(), reader, async (ms) => {
      paused.push(ms);
    }).explain(await analyse(root), "shop");
    expect(result).toEqual({ explained: 0 });
    // Each request waits longer each time; four requests wait at once.
    expect([...new Set(paused)]).toEqual([5000, 15000, 30000, 60000]);
  });

  it("asks again for what an answer left out, before the level above is written", async () => {
    // A model that leaves out the last thing of every request the first time
    // it is asked, and answers everything after.
    const inner = fake();
    const seen = new Set<string>();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const answer = await inner.provider.complete(completion);
        const names = [...completion.prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        const last = names.at(-1) as string;
        if (names.length < 2 || seen.has(last)) return answer;
        seen.add(last);
        const all = readAnswer(answer);
        all.delete(last);
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    const explainer = new Explainer(provider, memory(), reader);
    const progress: number[] = [];
    const result = await explainer.explain(await analyse(root), "shop", (p) =>
      progress.push(p.done),
    );
    expect(result).toEqual({ explained: 9 });
    expect(explainer.get("function", "lib/billing/charge.ts#charge")).toBeDefined();
    // The modules were written from the files once all of them were there.
    const modules = inner.prompts.find((p) =>
      p.startsWith("Explain each module of the area Billing"),
    );
    expect(modules).toContain(explainer.get("file", "lib/billing/charge.ts")?.simple);
    // Counted once each, never past the total.
    expect(progress.at(-1)).toBe(9);
    expect(Math.max(...progress)).toBe(9);
  });

  it("asks again, once the rest is done, for what stayed busy after every pause", async () => {
    // One request busy through every pause, then answered.
    let busyFor = 5;
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        if (completion.prompt.startsWith("Explain the file lib/db/save.ts") && busyFor-- > 0)
          throw new ProviderError("overloaded_error", 529);
        return inner.provider.complete(completion);
      },
    };
    const explainer = new Explainer(provider, memory(), reader, async () => {});
    const result = await explainer.explain(await analyse(root), "shop");
    expect(result).toEqual({ explained: 9 });
    expect(explainer.get("function", "lib/db/save.ts#save")).toBeDefined();
  });

  it("gives up on what never comes back readable without stopping a provider that works", async () => {
    // Five things among many the model always refuses: asked again alone,
    // each answer has nothing readable in it.
    const refused = new Set(["f3", "f9", "f15", "f21", "f27"]);
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const all = readAnswer(await inner.provider.complete(completion));
        for (const name of refused) all.delete(name);
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    for (let i = 0; i < 30; i++) await write(`lib/db/f${i}.ts`, `export function f${i}() {}\n`);
    const explainer = new Explainer(provider, memory(), reader);
    const result = await explainer.explain(await analyse(root), "shop");
    expect(result.stopped).toBeUndefined();
    expect(explainer.get("system", "shop")).toBeDefined();
    expect(explainer.get("function", "lib/db/f3.ts#f3")).toBeUndefined();
  });

  it("gives up on what the provider declines every time without stopping it", async () => {
    // As the Anthropic client reports a refusal: an error without a status.
    const declined = new Set(["f3", "f9", "f15", "f21", "f27"]);
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const names = [...completion.prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        if (names.length === 1 && declined.has(names[0] as string))
          throw new ProviderError(en.provider.declined);
        const all = readAnswer(await inner.provider.complete(completion));
        for (const name of declined) all.delete(name);
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    for (let i = 0; i < 30; i++) await write(`lib/db/f${i}.ts`, `export function f${i}() {}\n`);
    const explainer = new Explainer(provider, memory(), reader);
    const result = await explainer.explain(await analyse(root), "shop");
    expect(result.stopped).toBeUndefined();
    expect(explainer.get("system", "shop")).toBeDefined();
  });

  it("asks again what a failed request asked for", async () => {
    let failing = 1;
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        if (completion.prompt.startsWith("Explain the file lib/db/save.ts") && failing-- > 0)
          throw new ProviderError("internal", 500);
        return inner.provider.complete(completion);
      },
    };
    const explainer = new Explainer(provider, memory(), reader);
    expect(await explainer.explain(await analyse(root), "shop")).toEqual({ explained: 9 });
  });

  it("stops at a refused key even when the provider gives no reason", async () => {
    let requests = 0;
    const provider: Provider = {
      kind: "anthropic",
      complete: async () => {
        requests++;
        throw new ProviderError("", 401);
      },
    };
    const result = await new Explainer(provider, memory(), reader).explain(
      await analyse(root),
      "shop",
    );
    expect(result.stopped).toBe(en.provider.refused);
    // The first request of each of the four at once, and nothing after.
    expect(requests).toBeLessThanOrEqual(4);
  });

  it("gives a thing asked for again more room in its answer", async () => {
    const budgets = new Map<string, number[]>();
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const names = [...completion.prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        for (const name of names)
          budgets.set(name, [
            ...(budgets.get(name) ?? []),
            (completion.maxTokens ?? 0) / names.length,
          ]);
        const all = readAnswer(await inner.provider.complete(completion));
        if ((budgets.get("save")?.length ?? 0) < 2) all.delete("save");
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    await new Explainer(provider, memory(), reader).explain(await analyse(root), "shop");
    const [first, second] = budgets.get("save") ?? [];
    expect(second).toBeGreaterThan(first ?? Number.POSITIVE_INFINITY);
  });

  it("asks again in requests half as large each round", async () => {
    // A model that answers only the first thing of any request the first
    // time it sees it.
    const sizes: number[] = [];
    const seen = new Set<string>();
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const names = [...completion.prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        if (completion.prompt.startsWith("Explain the file lib/db/many.ts"))
          sizes.push(names.length);
        const all = readAnswer(await inner.provider.complete(completion));
        for (const name of names.slice(1)) if (!seen.has(name)) all.delete(name);
        for (const name of names) seen.add(name);
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    const many = Array.from({ length: 30 }, (_, i) => `export function f${i}() {}`).join("\n");
    await write("lib/db/many.ts", `${many}\n`);
    await new Explainer(provider, memory(), reader).explain(await analyse(root), "shop");
    // Twelve at most at first, six at most when asked again.
    expect(sizes.slice(0, 3)).toEqual([12, 12, 7]);
    expect(Math.max(...sizes.slice(3))).toBeLessThanOrEqual(6);
  });

  it("asks again, in all its rounds, no more requests than it first sent", async () => {
    // A model that only ever answers the first thing it is asked for: what a
    // repository could ask of it from its code, to multiply the requests.
    const inner = fake();
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        const names = [...completion.prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        const all = readAnswer(await inner.provider.complete(completion));
        for (const name of names.slice(1)) all.delete(name);
        return JSON.stringify(Object.fromEntries(all));
      },
    };
    const many = Array.from({ length: 30 }, (_, i) => `export function f${i}() {}`).join("\n");
    await write("lib/db/many.ts", `${many}\n`);
    const progress: number[] = [];
    await new Explainer(provider, memory(), reader).explain(await analyse(root), "shop", (p) =>
      progress.push(p.done),
    );
    // Five requests for the files' things at first (three for the 31 of
    // many.ts), so at most five more after, for all the files together.
    const files = inner.prompts.filter((p) => p.startsWith("Explain the file"));
    expect(files.length).toBeLessThanOrEqual(10);
    expect(Math.max(...progress)).toBe(progress.at(-1));
  });

  it("keeps the explanations a file had while it changed again since it was read, and only those of what is still in it", async () => {
    const explainer = new Explainer(fake().provider, memory(), reader);
    await write("lib/db/save.ts", "export function save() {}\nexport function old() {}\n");
    await explainer.explain(await analyse(root), "shop");
    expect(explainer.get("function", "lib/db/save.ts#old")).toBeDefined();
    // old() is removed and read; before its explanations are written, the
    // file changes again.
    await write("lib/db/save.ts", "export function save() {}\n");
    const read = await analyse(root);
    await write("lib/db/save.ts", "export function save() {\n  return 1;\n}\n");
    await explainer.explain(read, "shop");
    expect(explainer.get("function", "lib/db/save.ts#save")).toBeDefined();
    expect(explainer.get("file", "lib/db/save.ts")).toBeDefined();
    expect(explainer.get("function", "lib/db/save.ts#old")).toBeUndefined();
  });

  it("does not ask again after an error that is not the provider being busy", async () => {
    let requests = 0;
    const provider: Provider = {
      kind: "anthropic",
      complete: async () => {
        requests++;
        throw new ProviderError("server error", 500);
      },
    };
    const paused: number[] = [];
    await new Explainer(provider, memory(), reader, async (ms) => {
      paused.push(ms);
    }).explain(await analyse(root), "shop");
    expect(paused).toEqual([]);
    expect(requests).toBeLessThanOrEqual(8);
  });

  it("counts an answer with nothing readable in it as a failure, and says so", async () => {
    let requests = 0;
    const provider: Provider = {
      kind: "anthropic",
      complete: async () => {
        requests++;
        return "{}";
      },
    };
    for (let i = 0; i < 12; i++) await write(`lib/db/new${i}.ts`, `export function n${i}() {}\n`);
    const result = await new Explainer(provider, memory(), reader).explain(
      await analyse(root),
      "shop",
    );
    expect(result).toEqual({ explained: 0, stopped: "The answers could not be read." });
    expect(requests).toBeLessThanOrEqual(8);
  });

  it("asks for nothing more once cancelled", async () => {
    for (let i = 0; i < 12; i++) await write(`lib/db/new${i}.ts`, `export function n${i}() {}\n`);
    let requests = 0;
    const inner = fake();
    let explainer: Explainer | undefined;
    const provider: Provider = {
      kind: "anthropic",
      complete: async (completion) => {
        if (++requests === 2) explainer?.cancel();
        return inner.provider.complete(completion);
      },
    };
    explainer = new Explainer(provider, memory(), reader);
    await explainer.explain(await analyse(root), "shop");
    // The two, and the others already under way beside them.
    expect(requests).toBeLessThanOrEqual(5);
  });

  it("stops after five failures in a row, and still uses what is cached", async () => {
    const store = memory();
    await new Explainer(fake().provider, store, reader).explain(await analyse(root), "shop");
    // Twelve new files: twelve requests at least, one for each.
    for (let i = 0; i < 12; i++) await write(`lib/db/new${i}.ts`, `export function n${i}() {}\n`);
    let requests = 0;
    const down: Provider = {
      kind: "ollama",
      complete: async () => {
        requests++;
        throw new ProviderError("The provider could not be reached.");
      },
    };
    const explainer = new Explainer(down, store, reader);
    const result = await explainer.explain(await analyse(root), "shop");
    expect(result.stopped).toBe("The provider could not be reached.");
    // Five, and at most the three others already under way beside the fifth.
    expect(requests).toBeLessThanOrEqual(8);
    expect(explainer.get("function", "lib/billing/charge.ts#charge")).toBeDefined();
  });
});

describe("readAnswer", () => {
  it("reads the explanations by name from the first JSON object in an answer, and nothing else", () => {
    const read = readAnswer(
      'Sure! {"save": {"simple": " Saves it. ", "technical": "Calls `save`."}, "bad": {"simple": 1}}',
    );
    expect([...read]).toEqual([["save", { simple: "Saves it.", technical: "Calls `save`." }]]);
    expect(readAnswer("I cannot help with that.").size).toBe(0);
    // An answer cut off at its length: what is whole is still read.
    const cut = readAnswer(
      '{"a": {"simple": "Does a.", "technical": "`a`"}, "b": {"simple": "Does b.", "techn',
    );
    expect([...cut.keys()]).toEqual(["a"]);
  });

  it("reads a name the model wrapped in the heading's marks or backticks as the name asked for", () => {
    const read = readAnswer(
      '{"### save": {"simple": "a", "technical": "a"}, "`charge`": {"simple": "b", "technical": "b"}, " lib/db/save.ts ": {"simple": "c", "technical": "c"}, "`### refund`": {"simple": "d", "technical": "d"}}',
    );
    expect(read.get("save")?.simple).toBe("a");
    expect(read.get("charge")?.simple).toBe("b");
    expect(read.get("lib/db/save.ts")?.simple).toBe("c");
    expect(read.get("refund")?.simple).toBe("d");
  });

  it("keeps a private name, and never lets it stand for the public one", () => {
    const read = readAnswer(
      '{"#charge": {"simple": "private", "technical": "p"}, "charge": {"simple": "public", "technical": "q"}, "### #refund": {"simple": "r", "technical": "r"}}',
    );
    expect(read.get("#charge")?.simple).toBe("private");
    expect(read.get("charge")?.simple).toBe("public");
    expect(read.get("#refund")?.simple).toBe("r");
    expect(readAnswer('{"#void": {"simple": "v", "technical": "v"}}').get("void")).toBeUndefined();
  });

  it("takes a name written back as asked over one only read as it, in either order, whole or cut off", () => {
    const asked = '"save": {"simple": "as asked", "technical": "a"}';
    const wrapped = '"### save": {"simple": "wrapped", "technical": "w"}';
    const cutOff = ', "next": {"simple": "cut';
    for (const pair of [`${asked}, ${wrapped}`, `${wrapped}, ${asked}`]) {
      expect(readAnswer(`{${pair}}`).get("save")?.simple).toBe("as asked");
      expect(readAnswer(`{${pair}${cutOff}`).get("save")?.simple).toBe("as asked");
    }
  });
});
