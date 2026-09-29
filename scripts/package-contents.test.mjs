// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { strays } from "./package-contents.mjs";

describe("what codemapkit may ship", () => {
  it("is what its files name, and nothing a sync, a build or a run left beside it", () => {
    const shipped = [
      "package/package.json",
      "package/LICENSE",
      "package/NOTICE",
      "package/README.md",
      "package/bundle/bin.js",
      "package/web/index.html",
      "package/web/assets/index-4P8cYyqs.css",
      "package/grammars/tree-sitter-go.wasm",
      "package/licenses/THIRD-PARTY-NOTICES.txt",
    ];
    expect(strays(shipped)).toEqual([]);
    const left = [
      "package/bundle/bin 2.js",
      "package/web/assets 2/index.js",
      "package/licenses/LICENSE-tree-sitter-go 2",
      "package/bundle/bin.js.map",
      "package/.codemap/index.sqlite",
      "package/test-results/.last-run.json",
      "package/.env",
    ];
    expect(strays([...shipped, ...left])).toEqual(left);
  });
});
