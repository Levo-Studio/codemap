// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Topbar } from "../components/Topbar";
import { MotionProvider } from "../design/motion";
import type { Theme } from "../design/tokens";
import type { ConnectionStatus } from "../model/view";
import "../design/fonts/fonts.css";
import "../design/tokens.css";
import "../design/base.css";

// Renders one part or one screen with demo data, addressed by the URL, the
// way the design's reference renders were taken: /fixtures.html?part=topbar
// &theme=light&status=offline. Served by the Vite dev server for the visual
// tests only; it is not part of the production build.

const params = new URLSearchParams(window.location.search);
const theme: Theme = params.get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;

function Part({ name }: { name: string }) {
  switch (name) {
    case "topbar":
      return (
        <div style={{ width: 1440, height: 56 }}>
          <Topbar
            view={{
              project: "ledgerly-web",
              crumbs: ["System", "Billing"],
              status: (params.get("status") ?? "live") as ConnectionStatus,
              changes: 5,
              changesOpen: false,
            }}
          />
        </div>
      );
    default:
      return null;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <MotionProvider reduce={false}>
        <Part name={params.get("part") ?? ""} />
      </MotionProvider>
    </StrictMode>,
  );
}
