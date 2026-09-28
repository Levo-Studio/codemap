// SPDX-License-Identifier: Apache-2.0

import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { containerPadding, spacing } from "./design.js";
import type { Point, Rect } from "./view.js";

// Places the nodes of one map level left to right in call direction and
// routes the connections between them. The layout engine is elk's layered
// algorithm: nodes go into layers along the calls, each layer is a column,
// and connections are routed orthogonally around the nodes. Partitions pin
// nodes to the design's columns, so Entry is always left of API, API left of
// Features, Features left of Data & Services, whatever calls what.

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

// elkjs is CommonJS. Under Node's ES module interop its module object is the
// default import, and the constructor is also on its .default, which is the
// only place the types know it.
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

// A node of a map with opened nodes in it: an opened node holds what it
// opens to, and is laid out around it.
export interface TreeNode {
  id: string;
  width: number;
  height: number;
  // The column a node on the top level must be in.
  partition?: number;
  children?: TreeNode[];
}

// Lays out a map whose opened nodes hold their contents, in one pass: the
// top level in the design's columns, each opened node as a box around its
// own contents laid out left to right the same way, and the connections
// routed across the boxes to the nodes inside. Every rectangle and route is
// in the map's coordinates, the opened nodes' boxes included.
export async function layoutTree(nodes: TreeNode[], edges: LayoutEdge[]): Promise<Layout> {
  const ids = new Set<string>();
  const toElk = (node: TreeNode): ElkNode => {
    ids.add(node.id);
    const partition =
      node.partition === undefined ? {} : { "elk.partitioning.partition": String(node.partition) };
    if (!node.children)
      return { id: node.id, width: node.width, height: node.height, layoutOptions: partition };
    return {
      id: node.id,
      layoutOptions: {
        ...partition,
        ...spacingOptions,
        "elk.padding": `[top=${containerPadding.top},left=${containerPadding.side},bottom=${containerPadding.bottom},right=${containerPadding.side}]`,
        // Never smaller than the node it was before it opened.
        "elk.nodeSize.constraints": "[MINIMUM_SIZE]",
        "elk.nodeSize.minimum": `(${node.width},${node.height})`,
      },
      children: node.children.map(toElk),
    };
  };
  const children = nodes.map(toElk);
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.json.shapeCoords": "ROOT",
      "elk.json.edgeCoords": "ROOT",
      ...spacingOptions,
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children,
    edges: edges
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
      .map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const result = await elk.layout(graph);
  const placed = new Map<string, Rect>();
  const collect = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      placed.set(child.id, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      });
      collect(child);
    }
  };
  collect(result);
  const routes = new Map<string, Point[]>();
  const route = (node: ElkNode) => {
    for (const edge of node.edges ?? []) {
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
    for (const child of node.children ?? []) route(child);
  };
  route(result);
  return { nodes: placed, routes, width: result.width ?? 0, height: result.height ?? 0 };
}
