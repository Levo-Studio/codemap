// SPDX-License-Identifier: Apache-2.0

import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { spacing } from "./design.js";
import type { Point, Rect } from "./view.js";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  partition: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
}

export interface Layout {
  nodes: Map<string, Rect>;
  routes: Map<string, Point[]>;
  width: number;
  height: number;
}

const elk = new ELK.default();

const spacingOptions = {
  "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing.betweenColumns),
  "elk.spacing.nodeNode": String(spacing.betweenNodes),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(spacing.edgeToNode),
  "elk.spacing.edgeEdge": String(spacing.betweenEdges),
};

// Partitions pin nodes to the design's columns, left to right.
export async function layout(nodes: LayoutNode[], edges: LayoutEdge[]): Promise<Layout> {
  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
      "elk.separateConnectedComponents": "false",
      ...spacingOptions,
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      layoutOptions: { "elk.partitioning.partition": String(n.partition) },
    })),
    edges: edges
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
      .map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const result = await elk.layout(graph);
  const placed = new Map<string, Rect>();
  for (const child of result.children ?? []) {
    placed.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
    });
  }
  const routes = new Map<string, Point[]>();
  for (const edge of result.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section) continue;
    routes.set(
      edge.id,
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => ({
        x,
        y,
      })),
    );
  }
  return { nodes: placed, routes, width: result.width ?? 0, height: result.height ?? 0 };
}
