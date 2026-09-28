// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

// Workspace packages are imported from their TypeScript sources in tests,
// through the "source" export condition, so tests never need a build first.
export default defineConfig({
  resolve: { conditions: ["source"] },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "scripts/**/*.test.mjs",
    ],
  },
});
