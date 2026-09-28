// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { MapNode, NodeState } from "../model/view";
import { nodeLook } from "./nodeLook";

const module = (state: NodeState, extra: Partial<MapNode> = {}) =>
  nodeLook({ kind: "module", state, ...extra });

// The fourteen states of 04 Map Language, as Node.dc.html draws them. The
// screens show ten of them; these tests hold all of them.
describe("nodeLook", () => {
  it("default: card on a line-2 border", () => {
    expect(module("default")).toEqual({
      background: "card",
      border: { width: 1, style: "solid", color: "line2" },
      radius: 10,
      nameColor: "text1",
      pulse: false,
      outline: false,
      opacity: 1,
    });
  });

  it("hover: hover fill on a line-3 border, nothing else", () => {
    expect(module("hover")).toEqual({
      background: "hover",
      border: { width: 1, style: "solid", color: "line3" },
      radius: 10,
      nameColor: "text1",
      pulse: false,
      outline: false,
      opacity: 1,
    });
  });

  it("selected: a 2 px ink outline, nothing else changes", () => {
    expect(module("selected")).toMatchObject({ background: "card", outline: true });
    expect(module("default", { selected: true }).outline).toBe(true);
  });

  it("editing: orange tint, 1.5 px border, pulse and the word", () => {
    expect(module("editing")).toMatchObject({
      background: "editBg",
      border: { width: 1.5, style: "solid", color: "edit" },
      status: { text: "● Editing", color: "edit" },
      pulse: true,
    });
  });

  it("reading: blue tint on a dashed border", () => {
    expect(module("reading")).toMatchObject({
      background: "readBg",
      border: { style: "dashed", color: "read" },
      status: { text: "◌ Reading", color: "read" },
    });
  });

  it("changed, just now: green tint and the diamond", () => {
    expect(module("changed")).toMatchObject({
      background: "neuBg",
      status: { text: "◆ Changed", color: "neu" },
    });
  });

  it("changed, fading: the border fades and the word says how long ago", () => {
    expect(module("faded", { minutesAgo: 25 })).toEqual({
      background: "card",
      border: { width: 1, style: "solid", color: "neuFaded" },
      radius: 10,
      nameColor: "text1",
      status: { text: "◆ Changed 25 min ago", color: "text3" },
      pulse: false,
      outline: false,
      opacity: 1,
    });
  });

  it("new: green tint and the diamond", () => {
    expect(module("new")).toMatchObject({
      background: "neuBg",
      status: { text: "◆ New", color: "neu" },
    });
  });

  it("error: red border and the triangle with the count", () => {
    expect(module("error", { failingTests: 1 })).toMatchObject({
      border: { color: "err" },
      status: { text: "▲ 1 test failing", color: "errText" },
    });
  });

  it("search match: an ink border and the magnifier, on the card", () => {
    expect(module("search")).toEqual({
      background: "card",
      border: { width: 1, style: "solid", color: "text2" },
      radius: 10,
      nameColor: "text1",
      status: { text: "⌕ Match", color: "text1" },
      pulse: false,
      outline: false,
      opacity: 1,
    });
  });

  it("dimmed: .32 opacity", () => {
    expect(module("dimmed").opacity).toBe(0.32);
    expect(module("editing", { dimmed: true }).opacity).toBe(0.32);
  });

  it("not opened yet: no fill, dashed line-3 border, the name in text-4", () => {
    expect(module("unexplored")).toEqual({
      background: "transparent",
      border: { width: 1, style: "dashed", color: "line3" },
      radius: 10,
      nameColor: "text4",
      status: { text: "Not opened yet", color: "text4" },
      pulse: false,
      outline: false,
      opacity: 1,
    });
  });

  it("a custom status line keeps the state's colour", () => {
    expect(module("editing", { statusText: "● Agent editing" }).status).toEqual({
      text: "● Agent editing",
      color: "edit",
    });
  });

  it("areas are containers with a line-3 border and a 12 radius; files have 8", () => {
    expect(nodeLook({ kind: "area", state: "default" })).toMatchObject({
      background: "container",
      border: { color: "line3" },
      radius: 12,
    });
    expect(nodeLook({ kind: "file", state: "default" }).radius).toBe(8);
  });

  it("external services are outlined only, their name in text-2", () => {
    expect(nodeLook({ kind: "external", state: "default" })).toMatchObject({
      background: "transparent",
      nameColor: "text2",
    });
  });
});
