// SPDX-License-Identifier: Apache-2.0

import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { spacing } from "./design.js";
import type { Point, Rect } from "./view.js";

// Places the nodes of one map level left to right in call direction and routes
// the connections between them, with elk's layered algorithm: each layer is a
// column, and connections are routed orthogonally around the nodes. Partitions
// pin nodes to the design's columns, so Entry always stays left of API, API of
// Features and Features of Data & Services, whatever calls what.

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  // The column a node must be in; lower is further left.
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

// elkjs is CommonJS. Under Node's ES module interop the default import is the
// module object; the constructor is also on its .default, the only place the
// types declare it.
const elk = new ELK.default();

const spacingOptions = {
  "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing.betweenColumns),
  "elk.spacing.nodeNode": String(spacing.betweenNodes),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(spacing.edgeToNode),
  "elk.spacing.edgeEdge": String(spacing.betweenEdges),
};

export async function layout(nodes: LayoutNode[], edges: LayoutEdge[]): Promise<Layout> {
  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
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
