// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source"] },
  // Vite's server environment takes conditions from ssr.resolve only.
  ssr: { resolve: { conditions: ["source"] } },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "scripts/**/*.test.mjs",
    ],
  },
});
