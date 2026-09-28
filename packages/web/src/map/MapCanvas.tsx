// SPDX-License-Identifier: Apache-2.0

import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef } from "react";
import { camera as cameraMetrics, edge as edgeMetrics, map as m } from "../design/metrics";
import { color, font, rule, size, tracking, weight } from "../design/tokens";
import type { MapView, PlaceRef } from "../model/view";
import { en } from "../strings/en";
import { type Camera, isIdentity, pan, zoomAt } from "./camera";
import { EdgeLayer } from "./EdgeLayer";
import { midpoint } from "./edgeLook";
import { NodeView } from "./NodeView";

interface MapCanvasProps {
  view: MapView;
  width: number;
  height: number;
  // Applied to the drawn map only, not to the controls floating over it: the
  // disconnected state greys the map and leaves the controls alone.
  sceneStyle?: CSSProperties;
  camera: Camera;
  onCamera?: (camera: Camera) => void;
  onOpen?: (place: PlaceRef) => void;
  children?: ReactNode;
}

// The map as the design layers it: column labels, the filled container you
// are in, the connections, then the nodes on top, all on the dot grid. The
// camera moves the DOM layers with a transform and the WebGL stage with its
// own; a map shown at 1:1 gets no transform at all, as the design draws it.
export function MapCanvas({
  view,
  width,
  height,
  sceneStyle,
  camera,
  onCamera,
  onOpen,
  children,
}: MapCanvasProps) {
  const { container } = view;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const world: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
    ...(isIdentity(camera)
      ? {}
      : {
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`,
          transformOrigin: "0 0",
        }),
  };
  const grid = isIdentity(camera)
    ? { backgroundSize: `${m.gridSize}px ${m.gridSize}px` }
    : {
        backgroundSize: `${m.gridSize * camera.k}px ${m.gridSize * camera.k}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      };

  // A wheel pans; with Ctrl, or a trackpad pinch, which arrives as a wheel
  // with Ctrl, it zooms around the pointer. Either way the page itself must
  // not scroll or zoom, and React listens to wheels passively, where
  // preventDefault does nothing: the listener is the element's own.
  const surface = useRef<HTMLDivElement>(null);
  const onWheel = useRef<(event: WheelEvent) => void>(() => {});
  onWheel.current = (event) => {
    if (!onCamera || !surface.current) return;
    event.preventDefault();
    const box = surface.current.getBoundingClientRect();
    if (event.ctrlKey) {
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      onCamera(
        zoomAt(camera, Math.exp(-event.deltaY * cameraMetrics.wheelZoom), at, cameraMetrics),
      );
    } else {
      onCamera(pan(camera, -event.deltaX, -event.deltaY));
    }
  };
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const listener = (event: WheelEvent) => onWheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);
  // Dragging the background with the primary button pans; a press on a node
  // opens it instead.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (
      event.target !== event.currentTarget &&
      (event.target as HTMLElement).closest("[data-node]")
    )
      return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !onCamera) return;
    onCamera(pan(camera, event.clientX - drag.current.x, event.clientY - drag.current.y));
    drag.current = { x: event.clientX, y: event.clientY };
  };
  // Released, cancelled by the browser (a touch that turns into a gesture) or
  // captured elsewhere: the drag ends, so no later hover pans the map.
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={surface}
      data-map
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        backgroundImage: `radial-gradient(${color.dot} ${m.gridDot}px, transparent ${m.gridDot}px)`,
        ...grid,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width, height, ...sceneStyle }}>
        <div style={world}>
          {view.columns.map((column) => (
            <div
              key={column.id}
              style={{
                position: "absolute",
                left: column.x,
                top: m.column.top,
                fontSize: m.column.size,
                fontWeight: weight.semibold,
                letterSpacing: tracking.caps,
                color: color.text4,
              }}
            >
              {column.label}
            </div>
          ))}
          {container && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: container.x,
                  top: container.y,
                  width: container.width,
                  height: container.height,
                  borderRadius: m.container.radius,
                  border: rule(color.line3),
                  background: color.container,
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: container.x + m.container.titleX,
                  top: container.y + m.container.titleY,
                  display: "flex",
                  alignItems: "baseline",
                  gap: m.container.titleGap,
                }}
              >
                <span
                  style={
                    container.mono
                      ? {
                          fontFamily: font.mono,
                          fontWeight: weight.medium,
                          fontSize: m.container.monoTitleSize,
                        }
                      : { fontWeight: weight.bold, fontSize: m.container.titleSize }
                  }
                >
                  {container.title}
                </span>
                <span style={{ fontSize: size.s12, color: color.text4 }}>{container.meta}</span>
              </div>
            </>
          )}
        </div>
        <EdgeLayer edges={view.edges} width={width} height={height} camera={camera} />
        <div style={world}>
          {view.edges.map((edge) => {
            // A bundle carries its count in a pill halfway along, above the line.
            const at =
              edge.kind === "bundled" && edge.count !== undefined ? midpoint(edge.points) : null;
            if (!at) return null;
            const pill = edgeMetrics.bundle;
            return (
              <span
                key={`${edge.id}-count`}
                style={{
                  position: "absolute",
                  left: at.x,
                  top: at.y,
                  transform: "translate(-50%, -50%)",
                  width: pill.width,
                  height: pill.height,
                  boxSizing: "border-box",
                  borderRadius: pill.radius,
                  background: color.bg,
                  border: rule(color.line2),
                  display: "grid",
                  placeItems: "center",
                  fontFamily: font.mono,
                  fontSize: pill.size,
                  color: color.text3,
                }}
              >
                {en.meta.bundle(edge.count ?? 0)}
              </span>
            );
          })}
          {view.nodes.map((node) => (
            <NodeView key={node.id} node={node} {...(onOpen ? { onOpen } : {})} />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
