// SPDX-License-Identifier: Apache-2.0

import { jsonObjectIn, type Provider } from "./providers.js";
import type { AnswerStep, AskView, MapEdge, MapScreen } from "./view.js";

export interface Answer {
  question: string;
  intro: string;
  steps: AnswerStep[];
}

const maxSteps = 6;
const maxTokens = 800;

const system = [
  "You answer questions about an app for people who build it with an AI agent but may not read code.",
  "You are given the map of the part of the app the user is looking at: its nodes with their ids and what they do, and which calls which.",
  'Answer with JSON only: {"intro": "...", "steps": [{"node": "<id>", "text": "..."}]}.',
  "intro: one short sentence, e.g. saying in how many steps it happens.",
  `steps: at most ${maxSteps}, in the order things happen, each on a node from the list by its exact id; text continues after the node's name, lower case, one sentence, e.g. "takes the payment and reports it back."`,
  "Use only nodes from the list. If the map cannot answer the question, say so in intro and give no steps.",
].join("\n");

const namesOn = (screen: MapScreen) => new Map(screen.map.nodes.map((n) => [n.id, n.label]));

function readReply(reply: string): { intro?: unknown; steps?: unknown } | undefined {
  const json = jsonObjectIn(reply);
  if (json === undefined) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function describe(screen: MapScreen): string {
  const nodes = screen.map.nodes.map(
    (n) => `- ${n.id} | ${n.label} | ${n.kind}${n.description ? ` | ${n.description}` : ""}`,
  );
  const names = namesOn(screen);
  const calls = screen.map.edges.map(
    (e) => `- ${names.get(e.from) ?? e.from} calls ${names.get(e.to) ?? e.to}`,
  );
  const about =
    "text" in screen.panel && typeof screen.panel.text === "string" ? screen.panel.text : "";
  return [
    about && `About this part: ${about}`,
    "Nodes (id | name | kind | what it does):",
    ...nodes,
    "Calls:",
    ...calls,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function ask(
  provider: Provider,
  screen: MapScreen,
  question: string,
): Promise<Answer> {
  const reply = await provider.complete({
    system,
    prompt: `${describe(screen)}\n\nQuestion: ${question}`,
    maxTokens,
    effort: "best",
  });
  const parsed = readReply(reply);
  // A reply that is not JSON becomes the answer.
  if (!parsed) return { question, intro: reply.trim(), steps: [] };
  const steps = stepsOnMap(parsed.steps, namesOn(screen));
  return { question, intro: typeof parsed.intro === "string" ? parsed.intro.trim() : "", steps };
}

// Steps on nodes the map lacks are dropped, never drawn.
function stepsOnMap(replied: unknown, names: Map<string, string>): AnswerStep[] {
  const steps: AnswerStep[] = [];
  for (const step of Array.isArray(replied) ? replied : []) {
    const { node, text } = step as { node?: unknown; text?: unknown };
    if (typeof node !== "string" || typeof text !== "string") continue;
    const name = names.get(node);
    if (name && steps.length < maxSteps) steps.push({ id: node, name, text: text.trim() });
  }
  return steps;
}

// Numbers the answer's steps and dims everything else.
export function withAnswer(screen: MapScreen, answer: Answer, chat?: string): MapScreen {
  const order = new Map(answer.steps.map((s, i) => [s.id, i + 1]));
  const onPath = (edge: MapEdge) => {
    const from = order.get(edge.from);
    const to = order.get(edge.to);
    return from !== undefined && to !== undefined && to - from === 1;
  };
  const editing = "kind" in screen.chat && screen.chat.kind === "editing" ? screen.chat.file : "";
  const view: AskView = {
    ...(chat ? { chat } : {}),
    editingFile: editing ?? "",
    question: answer.question,
    intro: answer.intro,
    steps: answer.steps,
    explainStep: answer.steps.length,
  };
  return {
    ...screen,
    map: {
      ...screen.map,
      nodes: screen.map.nodes.map((n) => {
        const step = order.get(n.id);
        if (step !== undefined) return { ...n, step };
        // The selected node stays undimmed to mark the user's place.
        return n.selected ? n : { ...n, dimmed: true };
      }),
      edges: screen.map.edges.map((e) =>
        onPath(e)
          ? { ...e, kind: "path", strong: true }
          : { ...e, kind: "dimmed", strong: e.kind === "active" },
      ),
    },
    chat: view,
  };
}
