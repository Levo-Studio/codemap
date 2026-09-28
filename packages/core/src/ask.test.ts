// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ask, withAnswer } from "./ask.js";
import type { Completion, Provider } from "./providers.js";
import type { MapScreen } from "./view.js";

const node = (id: string, label: string) => ({
  id,
  label,
  kind: "area" as const,
  meta: "",
  state: "default" as const,
  x: 0,
  y: 0,
  width: 180,
  height: 72,
});

const screen: MapScreen = {
  kind: "map",
  topbar: { project: "shop", crumbs: ["System"], status: "live", changes: 0, changesOpen: false },
  map: {
    level: "system",
    columns: [],
    nodes: [
      node("dashboard", "Dashboard"),
      node("api", "API"),
      node("billing", "Billing"),
      node("auth", "Auth"),
    ],
    edges: [
      { id: "d>a", from: "dashboard", to: "api", kind: "call", points: [] },
      { id: "a>b", from: "api", to: "billing", kind: "call", points: [] },
      { id: "d>u", from: "dashboard", to: "auth", kind: "active", points: [] },
      { id: "a>d", from: "api", to: "dashboard", kind: "call", points: [] },
    ],
  },
  panel: {
    kind: "project",
    name: "shop",
    meta: "",
    explanation: "simple",
    text: "A shop.",
    activity: [],
    session: [],
    totalChanges: 0,
  },
  chat: { kind: "idle" },
};

function replying(reply: string) {
  const asked: Completion[] = [];
  const provider: Provider = {
    kind: "anthropic",
    complete: async (completion) => {
      asked.push(completion);
      return reply;
    },
  };
  return { provider, asked };
}

describe("ask", () => {
  it("answers in steps on nodes of the map, from what the map says", async () => {
    const { provider, asked } = replying(
      'Sure. {"intro": "In three steps.", "steps": [{"node": "dashboard", "text": "the customer picks a plan."}, {"node": "api", "text": "creates a checkout."}, {"node": "nowhere", "text": "invented."}, {"node": "billing", "text": " activates the plan. "}]}',
    );
    const answer = await ask(provider, screen, "How does a customer get charged?");
    expect(answer).toEqual({
      question: "How does a customer get charged?",
      intro: "In three steps.",
      steps: [
        { id: "dashboard", name: "Dashboard", text: "the customer picks a plan." },
        { id: "api", name: "API", text: "creates a checkout." },
        { id: "billing", name: "Billing", text: "activates the plan." },
      ],
    });
    expect(asked[0]?.effort).toBe("best");
    expect(asked[0]?.prompt).toContain("- dashboard | Dashboard | area");
    expect(asked[0]?.prompt).toContain("- Dashboard calls API");
    expect(asked[0]?.prompt).toContain("About this part: A shop.");
    expect(asked[0]?.prompt).toContain("Question: How does a customer get charged?");
  });

  it("gives a reply that is not the JSON asked for as the answer, without steps", async () => {
    const { provider } = replying("The map does not show payments.");
    expect(await ask(provider, screen, "Payments?")).toEqual({
      question: "Payments?",
      intro: "The map does not show payments.",
      steps: [],
    });
  });
});

describe("withAnswer", () => {
  it("numbers the steps, dims the rest and draws the path between the steps", () => {
    const shown = withAnswer(screen, {
      question: "How?",
      intro: "In three steps.",
      steps: [
        { id: "dashboard", name: "Dashboard", text: "a" },
        { id: "api", name: "API", text: "b" },
        { id: "billing", name: "Billing", text: "c" },
      ],
    });
    expect(shown.map.nodes.map((n) => [n.id, n.step, n.dimmed])).toEqual([
      ["dashboard", 1, undefined],
      ["api", 2, undefined],
      ["billing", 3, undefined],
      ["auth", undefined, true],
    ]);
    expect(shown.map.edges.map((e) => [e.id, e.kind, e.strong])).toEqual([
      ["d>a", "path", true],
      ["a>b", "path", true],
      ["d>u", "dimmed", true],
      // Against the steps' order: not the answer's path.
      ["a>d", "dimmed", false],
    ]);
    expect(shown.chat).toEqual({
      editingFile: "",
      question: "How?",
      intro: "In three steps.",
      steps: [
        { id: "dashboard", name: "Dashboard", text: "a" },
        { id: "api", name: "API", text: "b" },
        { id: "billing", name: "Billing", text: "c" },
      ],
      explainStep: 3,
    });
  });
});
