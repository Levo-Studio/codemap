// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";

// The package users install, codemapkit, is one bundle of the CLI with the
// workspace's core and server inside it, read from their sources. Every npm
// dependency stays outside, installed with the package: several bring
// binaries built for the user's platform.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] }, noExternal: [/^@codemap\//] },
  build: {
    ssr: "src/bin.ts",
    outDir: "bundle",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rolldownOptions: {
      // Every bare import but the workspace's own packages stays an import.
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@codemap/"),
      // Beside bin.js, so paths from a module to the package's grammars and
      // web app are the same as from the sources.
      output: { chunkFileNames: "[name]-[hash].js" },
    },
  },
});
