// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { camera as cameraMetrics, edge as edgeMetrics, map as m } from "../design/metrics";
import { containerTitle, dotGrid } from "../design/styles";
import { color, font, rule, tracking, weight } from "../design/tokens";
import type { MapView } from "../model/view";
import { en } from "../strings/en";
import { type Camera, isIdentity, pan, wheelFactor, zoomAt } from "./camera";
import { EdgeLayer } from "./EdgeLayer";
import { midpoint } from "./edgeLook";
import { useSettle } from "./glide";
import { NodeView } from "./NodeView";
import { OpenedBox } from "./OpenedBox";

interface MapCanvasProps {
  view: MapView;
  width: number;
  height: number;
  // Applied to the drawn map only, not to the controls floating over it: the
  // disconnected state greys the map and leaves the controls alone.
  sceneStyle?: CSSProperties;
  camera: Camera;
  onCamera?: (camera: Camera) => void;
  // Opens a node in place, or closes an opened one.
  onOpen?: (id: string) => void;
  // Selects a node, or nothing when the empty map is clicked.
  onSelect?: ((id: string | undefined) => void) | undefined;
  onEmptyDoubleClick?: (() => void) | undefined;
  // On the live map a node new to it enters with an animation, and a function
  // shows only its name and line, because its explanation is in the panel.
  // The first map simply appears; a static screen never changes and is drawn
  // as the design draws it.
  live?: boolean;
  children?: ReactNode;
}

// The map as the design layers it: column labels, the filled container of a
// design screen or the boxes of opened nodes, the connections, then the
// nodes on top, all on the dot grid. The camera moves the DOM layers with
// CSS zoom and a translate when zoomed in, a translate and a scale when
// zoomed out, and the WebGL stage with its own transform; a map shown at 1:1
// gets none of it, as the design draws it.
export function MapCanvas({
  view,
  width,
  height,
  sceneStyle,
  camera,
  onCamera,
  onOpen,
  onSelect,
  onEmptyDoubleClick,
  live = false,
  children,
}: MapCanvasProps) {
  const { container } = view;
  // What was on the map the last time it was drawn; nothing before the first.
  const seen = useRef<Set<string>>(undefined);
  const entering = (id: string) => live && !!seen.current && !seen.current.has(id);
  useEffect(() => {
    seen.current = new Set([...view.nodes, ...(view.opened ?? [])].map((n) => n.id));
  });
  // The positions of every node and opened box. When they change, the
  // connections wait for the nodes gliding to their new places.
  const everything = useMemo(() => [...view.nodes, ...(view.opened ?? [])], [view]);
  const settled = useSettle(everything);
  // Opening a node from the keyboard moves the focus to its box's title, and
  // closing the box moves it back to the node, once the map has them. The
  // node and the box are two elements, and the focus would otherwise fall to
  // the page. This happens only while the focus is still where it was, or has
  // fallen to the page because the element that held it is gone. Focus the
  // user moved elsewhere while the map loaded stays there; otherwise the next
  // Enter would close this box instead of acting where the user now is.
  const surface = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const refocus = useRef<{ id: string; on: "box" | "card"; from: Element }>(undefined);
  const toggle = (id: string, on: "box" | "card") => {
    const from = document.activeElement;
    refocus.current = from?.getAttribute("data-node") === id ? { id, on, from } : undefined;
    onOpen?.(id);
  };
  useEffect(() => {
    const wanted = refocus.current;
    if (!wanted) return;
    const now = document.activeElement;
    const fell = (!now || now === document.body) && !wanted.from.isConnected;
    if (now !== wanted.from && !fell) {
      refocus.current = undefined;
      return;
    }
    const node = CSS.escape(wanted.id);
    const target = surface.current?.querySelector<HTMLElement>(
      wanted.on === "box"
        ? `[data-opened="${node}"] [data-node]`
        : `[data-node="${node}"][aria-expanded="false"]`,
    );
    if (!target) return;
    refocus.current = undefined;
    target.focus({ preventScroll: true });
  });
  // A drag of the background: where the pointer was, and whether it moved.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Zoomed in, the layers use CSS zoom, not scale(): the browser lays the
  // nodes out again at the new size and draws their text sharp, where a
  // scaled layer would be a stretched picture. Zoom multiplies the element's
  // own lengths, its size and offset included, so those are given unzoomed.
  // Zoomed out, the layers are scaled: CSS zoom would ask for text below the
  // browser's minimum font size (Safari has one), which the browser then draws
  // at that minimum while the boxes around it shrink, so names spill out of
  // their nodes. Scaled text has no such floor.
  const world: CSSProperties = isIdentity(camera)
    ? { position: "absolute", left: 0, top: 0, width, height }
    : camera.k >= 1
      ? {
          position: "absolute",
          left: 0,
          top: 0,
          width: width / camera.k,
          height: height / camera.k,
          zoom: camera.k,
          transform: `translate(${camera.x / camera.k}px, ${camera.y / camera.k}px)`,
        }
      : {
          position: "absolute",
          left: 0,
          top: 0,
          width: width / camera.k,
          height: height / camera.k,
          transformOrigin: "left top",
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`,
        };
  const grid = isIdentity(camera)
    ? dotGrid()
    : { ...dotGrid(camera.k), backgroundPosition: `${camera.x}px ${camera.y}px` };

  // A wheel pans; with Ctrl, or a trackpad pinch (which arrives as a wheel
  // event with Ctrl), it zooms around the pointer. Either way the page itself
  // must not scroll or zoom. React listens to wheel events passively, where
  // preventDefault does nothing, so the element gets its own non-passive
  // listener.
  const onWheel = useRef<(event: WheelEvent) => void>(() => {});
  onWheel.current = (event) => {
    if (!onCamera || !surface.current) return;
    event.preventDefault();
    const box = surface.current.getBoundingClientRect();
    if (event.ctrlKey) {
      const at = { x: event.clientX - box.left, y: event.clientY - box.top };
      onCamera(
        zoomAt(
          camera,
          wheelFactor(event.deltaY, event.deltaMode, cameraMetrics.wheel),
          at,
          cameraMetrics,
        ),
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
  // A double click on the empty map: not on a node or an opened box's title,
  // and not on the controls, the chat or the answer lying over the map.
  const onEmpty = useRef(onEmptyDoubleClick);
  onEmpty.current = onEmptyDoubleClick;
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const listener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const onMap = target === element || !!scene.current?.contains(target);
      if (onMap && !target.closest("[data-node]")) onEmpty.current?.();
    };
    element.addEventListener("dblclick", listener);
    return () => element.removeEventListener("dblclick", listener);
  }, []);
  // Dragging the background with the primary button pans; a press on a node
  // selects or opens it instead. Only the map itself starts a drag: the
  // controls lying over it (zoom, chat bar, the disconnected banner) keep
  // their own presses, which the captured pointer would otherwise take away.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const onMap = target === event.currentTarget || !!scene.current?.contains(target);
    if (!onMap || target.closest("[data-node]")) return;
    drag.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !onCamera) return;
    if (event.clientX === drag.current.x && event.clientY === drag.current.y) return;
    moved.current = true;
    onCamera(pan(camera, event.clientX - drag.current.x, event.clientY - drag.current.y));
    drag.current = { x: event.clientX, y: event.clientY };
  };
  // Released, cancelled by the browser (a touch that turns into a gesture) or
  // captured elsewhere: the drag ends, so no later hover pans the map.
  const endDrag = () => {
    drag.current = null;
  };
  // A press on the empty map that did not move it clears the selection.
  const release = () => {
    if (drag.current && !moved.current) onSelect?.(undefined);
    endDrag();
  };

  return (
    <div
      ref={surface}
      data-map
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      style={{
        position: "relative",
        width,
        height,
        // Clipped, not hidden: a hidden overflow still scrolls when a node
        // outside the view is focused, from the keyboard or the code, and
        // the map would slide under its controls. Only the camera moves it.
        overflow: "clip",
        ...grid,
      }}
    >
      <div
        ref={scene}
        style={{ position: "absolute", left: 0, top: 0, width, height, ...sceneStyle }}
      >
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
                <span style={containerTitle(container.mono)}>{container.title}</span>
                <span style={{ fontSize: m.container.metaSize, color: color.text4 }}>
                  {container.meta}
                </span>
              </div>
            </>
          )}
          {view.opened?.map((box) => (
            <OpenedBox
              key={box.id}
              box={box}
              entering={entering(box.id)}
              {...(onOpen ? { onOpen: (id: string) => toggle(id, "card") } : {})}
              onSelect={onSelect}
            />
          ))}
        </div>
        <motion.div
          style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: settled }}
        >
          <EdgeLayer edges={view.edges} width={width} height={height} camera={camera} />
        </motion.div>
        {/* This layer lies over the opened boxes. Only its nodes take the
            pointer, so a box's title below can still be clicked. */}
        <div style={{ ...world, pointerEvents: "none" }}>
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
            <NodeView
              key={node.id}
              node={node}
              entering={entering(node.id)}
              explained={!live}
              {...(onOpen ? { onOpen: () => toggle(node.id, "box") } : {})}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
