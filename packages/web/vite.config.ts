// SPDX-License-Identifier: Apache-2.0

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The production build has one entry, index.html. fixtures.html renders single
// screens with demo data for the visual tests and exists only on the dev
// server, so no fixture reaches the shipped app.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
