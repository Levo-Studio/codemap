// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { fixtureScreen } from "../fixtures/ledgerly";
import type { MapScreen } from "../model/view";
import { en } from "../strings/en";
import { toOffline } from "./offline";

describe("toOffline", () => {
  it("turns the live map into the design's disconnected one", () => {
    const at = new Date(2026, 8, 28, 14, 40).getTime();
    const system = (mode: string) => fixtureScreen("map-system", mode, "dark") as MapScreen;
    const shown = toOffline(system("default"), 4, at);
    const drawn = system("offline");
    expect(shown.topbar).toEqual(drawn.topbar);
    expect(shown.map.nodes).toEqual(drawn.map.nodes);
    expect(shown.map.edges).toEqual(drawn.map.edges);
    expect(shown.chat).toEqual(drawn.chat);
    expect(shown.offline).toEqual(drawn.offline);
    expect(shown.panel).toMatchObject({ kind: "project", activityTime: en.clock(at) });
  });
});
