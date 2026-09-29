// SPDX-License-Identifier: Apache-2.0

import { MotionConfig } from "motion/react";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";

// Motion in Codemap only signals that something is happening in the code; it
// never decorates. No bounce, no overshoot. Values from design/03 Foundations.

// One-off transitions, in seconds as Motion expects them.
export const duration = {
  // Hover, press, toggles.
  fast: 0.12,
  // Panels, chat opening, palette.
  base: 0.2,
  // Semantic zoom between levels.
  zoom: 0.48,
  // A new node entering the map: scale .96 to 1 plus fade.
  enter: 0.32,
} as const;

// cubic-bezier(.2, 0, 0, 1), used for everything that is not a loop.
export const ease = [0.2, 0, 0, 1] as const;

// The CSS default "ease", which the export's keyframe loops run on when they
// name no curve of their own.
export const cssEase = [0.25, 0.1, 0.25, 1] as const;

export const enterScale = 0.96;

// Loops, in seconds. Each one becomes a static marker under reduced motion.
export const loop = {
  // The editing pulse around a node: ring 0 to 6 px and back, ease-in-out.
  editingPulse: 2.6,
  editingPulseRing: 6,
  // Dashes flowing along an active edge toward the callee, linear.
  edgeFlow: 1,
  edgeFlowDash: [6, 4] as const,
  edgeFlowOffset: 18,
  // The bar across the top of the map while an opened map is on its way (the
  // owner asked for it; these values are the agent's, an open question in
  // CONTEXT.md): a third of it runs across, linear.
  opening: 1.2,
  openingShare: 1 / 3,
  // Shown only when the map takes longer than this, so a quick one does not
  // flash it.
  openingAfter: 0.15,
  // The chat bar's dot while the agent is editing: opacity 1 to .35 and back.
  chatDot: 1.4,
  chatDotLow: 0.35,
  // The mark while indexing: the link draws, then the callee fills. The
  // loading screen draws a 2.4 s cycle; the brand sheet's 3 s is a
  // presentation speed.
  markIndexing: 2.4,
} as const;

export function loopMilliseconds(seconds: number): number {
  return seconds * 1000;
}

// The changed marker fades out over this time unless Settings says otherwise.
export const changedFadeMinutes = 30;

// Reduced motion is the system preference or the Settings switch, whichever
// asks for less. Resolved here and nowhere else: a component asks
// `useReducedMotion()` and never reads the media query itself.
export function resolveReducedMotion(systemPrefersReduced: boolean, settingOn: boolean): boolean {
  return systemPrefersReduced || settingOn;
}

const query = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function systemPrefersReduced(): boolean {
  return window.matchMedia(query).matches;
}

const ReducedMotion = createContext(false);

export function useReducedMotion(): boolean {
  return useContext(ReducedMotion);
}

// Wraps the app once. Motion's own reduced-motion handling follows the same
// answer, so a transform animation and a loop never disagree.
export function MotionProvider({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  const system = useSyncExternalStore(subscribe, systemPrefersReduced, () => false);
  const reduced = resolveReducedMotion(system, reduce);
  return createElement(
    ReducedMotion.Provider,
    { value: reduced },
    createElement(
      MotionConfig,
      {
        reducedMotion: reduced ? "always" : "never",
        transition: { duration: duration.base, ease },
      },
      children,
    ),
  );
}
