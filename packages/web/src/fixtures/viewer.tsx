// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatBar } from "../components/ChatBar";
import { Legend } from "../components/Legend";
import { Topbar } from "../components/Topbar";
import { ZoomControl } from "../components/ZoomControl";
import { MotionProvider } from "../design/motion";
import type { Theme } from "../design/tokens";
import type { ChatBarKind, ConnectionStatus, Level } from "../model/view";
import { LoadingScreenView } from "../screens/LoadingScreenView";
import { MapScreenView } from "../screens/MapScreenView";
import { type FixtureName, fixtureScreen } from "./ledgerly";
import "../design/fonts/fonts.css";
import "../design/tokens.css";
import "../design/base.css";
import "../design/motion.css";

// Renders one part or one screen with demo data, addressed by the URL, the
// way the design's reference renders were taken: /fixtures.html?part=topbar
// &theme=light&status=offline. Served by the Vite dev server for the visual
// tests only; it is not part of the production build. ?motion=reduce stops
// every loop in its first frame, which is what the references show.

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
    case "chatbar":
      return (
        <div style={{ width: 580, height: 96 }}>
          <ChatBar
            view={{
              kind: (params.get("kind") ?? "editing") as ChatBarKind,
              file: "billing/webhook.ts",
            }}
          />
        </div>
      );
    case "legend":
      return (
        <div style={{ width: 120, height: 130 }}>
          <Legend />
        </div>
      );
    case "zoomctl": {
      const levels: Level[] = ["system", "area", "file", "function"];
      return (
        <div style={{ width: 140, height: 110 }}>
          <ZoomControl level={levels[Number(params.get("level") ?? 1)] ?? "area"} />
        </div>
      );
    }
    default:
      return null;
  }
}

function ScreenFixture({ name }: { name: FixtureName }) {
  const screen = fixtureScreen(name, params.get("mode") ?? "default", theme);
  switch (screen.kind) {
    case "map":
      return <MapScreenView screen={screen} />;
    case "loading":
      return <LoadingScreenView screen={screen} />;
    default:
      return null;
  }
}

const screenName = params.get("screen") as FixtureName | null;
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <MotionProvider reduce={params.get("motion") === "reduce"}>
        {screenName ? (
          <ScreenFixture name={screenName} />
        ) : (
          <Part name={params.get("part") ?? ""} />
        )}
      </MotionProvider>
    </StrictMode>,
  );
}
