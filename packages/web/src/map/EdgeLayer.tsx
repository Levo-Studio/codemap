// SPDX-License-Identifier: Apache-2.0

import { Application, Graphics } from "pixi.js";
import { useEffect, useRef } from "react";
import { loop, useReducedMotion } from "../design/motion";
import { palette, type Theme } from "../design/tokens";
import type { MapEdge, Point } from "../model/view";
import { arrow, dashes, type EdgeLook, edgeLook } from "./edgeLook";

// Connections are the part of the map that grows with the codebase, so they
// are drawn with WebGL. Nodes stay in the DOM above them: at any zoom level
// only a readable number of nodes is on screen, and the DOM draws their text,
// dashed borders and outlines exactly as the design does.

interface EdgeLayerProps {
  edges: MapEdge[];
  theme: Theme;
  width: number;
  height: number;
}

function stroke(g: Graphics, line: Point[], look: EdgeLook, color: string) {
  const [first, ...rest] = line;
  if (!first) return;
  g.moveTo(first.x, first.y);
  for (const p of rest) g.lineTo(p.x, p.y);
  g.stroke({ width: look.width, color, join: "round", cap: "butt" });
}

function draw(g: Graphics, edges: MapEdge[], theme: Theme, offset: number) {
  g.clear();
  for (const edge of edges) {
    const look = edgeLook(edge);
    const color = palette[theme][look.color];
    const { line, head } = arrow(edge.points);
    if (look.dash) {
      for (const dash of dashes(line, look.dash, offset)) stroke(g, dash, look, color);
    } else {
      stroke(g, line, look, color);
    }
    g.poly(head.flatMap((p) => [p.x, p.y])).fill(color);
  }
}

export function EdgeLayer({ edges, theme, width, height }: EdgeLayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const app = new Application();
    const still = new Graphics();
    const flowing = new Graphics();
    let alive = true;
    let ready = false;

    const moving = edges.filter((e) => edgeLook(e).flowing);
    const resting = edges.filter((e) => !edgeLook(e).flowing);

    app
      .init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        if (!alive) {
          app.destroy(true);
          return;
        }
        ready = true;
        element.appendChild(app.canvas);
        app.stage.addChild(still, flowing);
        draw(still, resting, theme, 0);
        draw(flowing, moving, theme, 0);
        if (!reduced && moving.length > 0) {
          // stroke-dashoffset 0 → −18 per second, linear, as in the export.
          const period = loop.edgeFlow * 1000;
          app.ticker.add(() => {
            const t = (performance.now() % period) / period;
            draw(flowing, moving, theme, -t * loop.edgeFlowOffset);
          });
        }
      });

    return () => {
      alive = false;
      if (ready) app.destroy(true);
    };
  }, [edges, theme, width, height, reduced]);

  return <div ref={host} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}
