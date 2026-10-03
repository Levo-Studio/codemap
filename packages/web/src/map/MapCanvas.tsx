// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
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
  sceneStyle?: CSSProperties;
  camera: Camera;
  onCamera?: (camera: Camera) => void;
  onOpen?: (id: string) => void;
  onSelect?: ((id: string | undefined) => void) | undefined;
  onEmptyDoubleClick?: (() => void) | undefined;
  live?: boolean;
  children?: ReactNode;
}

function useEntering(view: MapView, live: boolean) {
  const seen = useRef<Set<string>>(undefined);
  const entering = (id: string) => live && !!seen.current && !seen.current.has(id);
  useEffect(() => {
    seen.current = new Set([...view.nodes, ...(view.opened ?? [])].map((n) => n.id));
  });
  return entering;
}

// Refocus only while focus stayed, or fell with its element.
function useRefocusAfterToggle(
  surface: RefObject<HTMLDivElement | null>,
  onOpen: ((id: string) => void) | undefined,
) {
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
  return toggle;
}

function useBackgroundDrag(
  scene: RefObject<HTMLDivElement | null>,
  camera: Camera,
  onCamera: ((camera: Camera) => void) | undefined,
  onSelect: ((id: string | undefined) => void) | undefined,
) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Only the map drags; capture would steal the controls' presses.
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
  const endDrag = () => {
    // Also on cancel or lost capture, so hovering never pans.
    drag.current = null;
  };
  const release = () => {
    if (drag.current && !moved.current) onSelect?.(undefined);
    endDrag();
  };
  return { onPointerDown, onPointerMove, release, endDrag };
}

// Zoom keeps text sharp; scale avoids the minimum font size.
function worldStyle(camera: Camera, width: number, height: number): CSSProperties {
  return isIdentity(camera)
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
}

// Only nodes take the pointer; box titles below stay clickable.
function nodeLayerStyle(world: CSSProperties): CSSProperties {
  return { ...world, pointerEvents: "none" };
}

// preventDefault needs a non-passive listener; React's is passive.
function useWheel(
  surface: RefObject<HTMLDivElement | null>,
  camera: Camera,
  onCamera: ((camera: Camera) => void) | undefined,
) {
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens once, on a stable ref
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const listener = (event: WheelEvent) => onWheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);
}

function useEmptyDoubleClick(
  surface: RefObject<HTMLDivElement | null>,
  scene: RefObject<HTMLDivElement | null>,
  onEmptyDoubleClick: (() => void) | undefined,
) {
  const onEmpty = useRef(onEmptyDoubleClick);
  onEmpty.current = onEmptyDoubleClick;
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens once, on stable refs
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
}

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
  const entering = useEntering(view, live);
  const everything = useMemo(() => [...view.nodes, ...(view.opened ?? [])], [view]);
  const settled = useSettle(everything);
  const surface = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const toggle = useRefocusAfterToggle(surface, onOpen);
  const { onPointerDown, onPointerMove, release, endDrag } = useBackgroundDrag(
    scene,
    camera,
    onCamera,
    onSelect,
  );
  const world = worldStyle(camera, width, height);
  const grid = isIdentity(camera)
    ? dotGrid()
    : { ...dotGrid(camera.k), backgroundPosition: `${camera.x}px ${camera.y}px` };
  useWheel(surface, camera, onCamera);
  useEmptyDoubleClick(surface, scene, onEmptyDoubleClick);

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
        // Clip, not hidden: hidden still scrolls to a focused node.
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
        <div style={nodeLayerStyle(world)}>
          {view.edges.map((edge) => {
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
