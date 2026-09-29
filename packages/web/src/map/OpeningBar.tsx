// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { loading as m } from "../design/metrics";
import { loop, useReducedMotion } from "../design/motion";
import { color } from "../design/tokens";
import { en } from "../strings/en";

// Across the top of the map while an opened map is on its way (the owner's;
// not in the export): the indexing screen's progress bar, its height, radius
// and track, with a part of it running across, since how long it takes is not
// known. In ink, not orange: orange belongs to the agent. Under reduced
// motion the part stands still.
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
          borderRadius: m.progress.radius,
          background: color.text1,
        }}
      />
    </motion.div>
  );
}
