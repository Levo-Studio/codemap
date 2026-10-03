// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { loading as m } from "../design/metrics";
import { loop, useReducedMotion } from "../design/motion";
import { color } from "../design/tokens";
import { en } from "../strings/en";

// A bar across the top of the map while an opened map loads. It reuses the
// height, radius and track of the indexing screen's progress bar; a segment
// runs across it because the load time is unknown. The segment is ink, not
// orange, because orange belongs to the agent. Under reduced motion the
// segment stands still.
export function OpeningBar() {
  const reduced = useReducedMotion();
  const share = `${loop.openingShare * 100}%`;
  return (
    <motion.div
      role="progressbar"
      aria-label={en.loading.opening}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: loop.openingAfter, duration: 0 }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: m.progress.height,
        borderRadius: m.progress.radius,
        background: color.line2,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <motion.div
        {...(reduced
          ? {}
          : {
              initial: { x: "-100%" },
              animate: { x: `${100 / loop.openingShare}%` },
              transition: { duration: loop.opening, ease: "linear", repeat: Infinity },
            })}
        style={{
          width: share,
          height: "100%",
          background: color.text1,
        }}
      />
    </motion.div>
  );
}
