// SPDX-License-Identifier: Apache-2.0

import { Application, Graphics } from "pixi.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { loop, loopMilliseconds, useReducedMotion } from "../design/motion";
import { useResolvedTheme } from "../design/theme";
import { palette, type Theme } from "../design/tokens";
import type { MapEdge, Point } from "../model/view";
import { arrow, dashes, type EdgeLook, edgeLook } from "./edgeLook";

// Connections are the part of the map that grows with the codebase, so they
// are drawn with WebGL. Nodes stay in the DOM above them: at any zoom level
// only a readable number of nodes is on screen, and the DOM draws their text,
// dashed borders and outlines exactly as the design does.
//
// One Pixi application lives as long as the layer. Edges, theme, size and
// reduced motion change what it draws, never the application itself: a new
// WebGL context per change would flash, and Chrome allows only a handful of
// contexts before it drops the oldest.

interface EdgeLayerProps {
  edges: MapEdge[];
  width: number;
  height: number;
}

interface Stage {
  app: Application;
  still: Graphics;
  flowing: Graphics;
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
    const shape = arrow(edge.points);
    if (!shape) continue;
    if (look.dash) {
      for (const dash of dashes(shape.line, look.dash, offset)) stroke(g, dash, look, color);
    } else {
      stroke(g, shape.line, look, color);
    }
    g.poly(shape.head.flatMap((p) => [p.x, p.y])).fill(color);
  }
}

export function EdgeLayer({ edges, width, height }: EdgeLayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const size = useRef({ width, height });
  size.current = { width, height };
  const [stage, setStage] = useState<Stage | null>(null);
  const reduced = useReducedMotion();
  const theme = useResolvedTheme();

  // The application, once per mount. Init is asynchronous; a layer that
  // unmounts before it finishes destroys what init produced. Without WebGL
  // the map keeps its nodes and shows no connections instead of failing.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const app = new Application();
    let alive = true;
    let created: Stage | null = null;
    app
      .init({
        width: size.current.width,
        height: size.current.height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        const still = new Graphics();
        const flowing = new Graphics();
        app.stage.addChild(still, flowing);
        created = { app, still, flowing };
        if (!alive) {
          app.destroy(true, { children: true });
          return;
        }
        element.appendChild(app.canvas);
        setStage(created);
      })
      .catch(() => {
        created = null;
      });
    return () => {
      alive = false;
      if (created) app.destroy(true, { children: true });
      setStage(null);
    };
  }, []);

  useEffect(() => {
    stage?.app.renderer.resize(width, height);
  }, [stage, width, height]);

  const [moving, resting] = useMemo(
    () => [edges.filter((e) => edgeLook(e).flowing), edges.filter((e) => !edgeLook(e).flowing)],
    [edges],
  );

  useEffect(() => {
    if (!stage) return;
    draw(stage.still, resting, theme, 0);
    draw(stage.flowing, moving, theme, 0);
    if (reduced || moving.length === 0) return;
    // stroke-dashoffset 0 → −18 per second, linear, as in the export.
    const period = loopMilliseconds(loop.edgeFlow);
    const tick = () => {
      const t = (performance.now() % period) / period;
      draw(stage.flowing, moving, theme, -t * loop.edgeFlowOffset);
    };
    stage.app.ticker.add(tick);
    return () => {
      stage.app.ticker.remove(tick);
    };
  }, [stage, resting, moving, theme, reduced]);

  return <div ref={host} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}
