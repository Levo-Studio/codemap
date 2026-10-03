// SPDX-License-Identifier: Apache-2.0

import type { MapScreen } from "../model/view";
import { en } from "../strings/en";

// Nothing is known offline, so live states drop to default.
export function toOffline(screen: MapScreen, retryIn: number, lastSeen: number): MapScreen {
  return {
    ...screen,
    topbar: { ...screen.topbar, status: "offline" },
    map: {
      ...screen.map,
      nodes: screen.map.nodes.map(
        ({ statusText: _statusText, minutesAgo: _minutesAgo, ...node }) => ({
          ...node,
          state: "default",
        }),
      ),
      edges: screen.map.edges.map(({ strong: _strong, ...edge }) =>
        edge.kind === "bundled" ? edge : { ...edge, kind: "call" },
      ),
    },
    panel:
      screen.panel.kind === "project"
        ? { ...screen.panel, activityTime: en.clock(lastSeen) }
        : screen.panel,
    chat: { kind: "offline" },
    offline: { retryIn },
  };
}
