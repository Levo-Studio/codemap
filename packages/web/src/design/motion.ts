// SPDX-License-Identifier: Apache-2.0

import { MotionConfig } from "motion/react";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";

// 03 Foundations.
export const duration = {
  fast: 0.12,
  base: 0.2,
  zoom: 0.48,
  enter: 0.32,
} as const;

type Bezier = [number, number, number, number];

export const ease: Bezier = [0.2, 0, 0, 1];

// CSS default ease, which the export's loops run on.
export const cssEase: Bezier = [0.25, 0.1, 0.25, 1];

export const enterScale = 0.96;

export const loop = {
  editingPulse: 2.6,
  editingPulseRing: 6,
  edgeFlow: 1,
  edgeFlowDash: [6, 4] as const,
  edgeFlowOffset: 18,
  // Not in the export; open question in CONTEXT.md.
  opening: 1.2,
  openingShare: 1 / 3,
  openingAfter: 0.15,
  chatDot: 1.4,
  chatDotLow: 0.35,
  // The loading screen's cycle, not the brand sheet's.
  markIndexing: 2.4,
} as const;

export const changedFadeMinutes = 30;

export function resolveReducedMotion(systemReduces: boolean, settingOn: boolean): boolean {
  return systemReduces || settingOn;
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

// Motion's own reduced motion follows the same answer.
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
