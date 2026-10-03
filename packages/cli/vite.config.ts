// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";

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
      // npm dependencies stay external; several ship platform binaries.
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@codemap/"),
      // Beside bin.js, so grammar and web paths match the sources.
      output: { chunkFileNames: "[name]-[hash].js" },
    },
  },
});
