// SPDX-License-Identifier: Apache-2.0

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The production build has one entry, index.html. fixtures.html renders single
// screens with demo data for the visual tests and exists only on the dev
// server, so no fixture reaches the shipped app.
export default defineConfig({
  plugins: [react()],
  // Core is read from its TypeScript sources, in development and in the
  // build, so the web app never needs core built first.
  resolve: { conditions: ["source"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Nothing is inlined as a data: address: the server's CSP loads fonts and
    // images only from itself, so every asset has to be a file.
    assetsInlineLimit: 0,
    // The app is one main chunk, PixiJS most of it, served over loopback from
    // the user's own disk, where splitting it saves nothing. The limit sits a
    // little above that chunk's size, so a real jump still warns.
    chunkSizeWarningLimit: 800,
  },
});
