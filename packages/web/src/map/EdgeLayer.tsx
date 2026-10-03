// SPDX-License-Identifier: Apache-2.0

import { Application, Graphics } from "pixi.js";
import "pixi.js/unsafe-eval";
import { useEffect, useMemo, useRef, useState } from "react";
import { live } from "../design/metrics";
import { loop, useReducedMotion } from "../design/motion";
import { useResolvedTheme } from "../design/theme";
import { palette, type Theme } from "../design/tokens";
import type { MapEdge, Point } from "../model/view";
import type { Camera } from "./camera";
import { arrow, dashes, type EdgeLook, edgeLook } from "./edgeLook";

interface EdgeLayerProps {
  edges: MapEdge[];
  width: number;
  height: number;
  camera: Camera;
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

// One WebGL context per mount; the CSP needs pixi.js/unsafe-eval.
export function EdgeLayer({ edges, width, height, camera }: EdgeLayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const size = useRef({ width, height });
  size.current = { width, height };
  const [stage, setStage] = useState<Stage | null>(null);
  const reduced = useReducedMotion();
  const theme = useResolvedTheme();

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
        // Without WebGL the map shows no connections.
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

  useEffect(() => {
    if (!stage) return;
    stage.app.stage.position.set(camera.x, camera.y);
    stage.app.stage.scale.set(camera.k);
  }, [stage, camera]);

  const [moving, resting] = useMemo(
    () => [edges.filter((e) => edgeLook(e).flowing), edges.filter((e) => !edgeLook(e).flowing)],
    [edges],
  );

  useEffect(() => {
    if (!stage) return;
    draw(stage.still, resting, theme, 0);
    draw(stage.flowing, moving, theme, 0);
    if (reduced || moving.length === 0) return;
    const period = loop.edgeFlow * live.second;
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
