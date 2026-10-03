// SPDX-License-Identifier: Apache-2.0

import { useAnimate } from "motion/react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { chatPanel } from "../design/metrics";
import { duration, ease } from "../design/motion";

const shown = { opacity: 1, x: 0 };
const hidden = { opacity: 0, x: -chatPanel.slide };
const slide = { duration: duration.base, ease };

// Slides the old content out, then the new in.
export function PanelSwap({ name, children }: { name: string; children: ReactNode }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [current, setCurrent] = useState(name);
  const kept = useRef(children);
  if (name === current) kept.current = children;
  const latest = useRef(name);
  latest.current = name;
  const exit = useRef(0);
  const leaving = useRef(false);
  const entering = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only as the names change
  useEffect(() => {
    if (name === current) {
      if (!leaving.current && !entering.current) return;
      leaving.current = false;
      entering.current = false;
      exit.current++;
      void animate(scope.current, shown, slide);
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    const mine = ++exit.current;
    void animate(scope.current, hidden, slide).then(() => {
      if (mine !== exit.current) return;
      leaving.current = false;
      entering.current = true;
      setCurrent(latest.current);
    });
  }, [name, current]);
  return (
    <div ref={scope} data-panel-content style={{ height: "100%" }}>
      <Fragment key={current}>{kept.current}</Fragment>
    </div>
  );
}
