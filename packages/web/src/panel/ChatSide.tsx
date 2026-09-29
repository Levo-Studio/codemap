// SPDX-License-Identifier: Apache-2.0

import { AnswerBody } from "../components/AskPanel";
import { ask, chatPanel as m } from "../design/metrics";
import { color, size } from "../design/tokens";
import type { AskView } from "../model/view";
import { en } from "../strings/en";

// An answer moved into the panel when the user went on to the map (the
// owner's; not in the export): a small bar, drawn as the follow-up field,
// that brings the answer back over the map with that field ready, and the
// answer, which scrolls.
export function ChatSide({
  view,
  onBack,
  onAsk,
  onZoomToSteps,
}: {
  view: AskView;
  onBack: () => void;
  onAsk?: (question: string) => void;
  onZoomToSteps?: () => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* In line with the answer below it. */}
      <div style={{ padding: `${ask.body.paddingY}px ${ask.body.paddingX}px 0` }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            width: "100%",
            textAlign: "left",
            border: "none",
            borderRadius: m.bar.radius,
            padding: `${m.bar.paddingY}px ${m.bar.paddingX}px`,
            background: color.field,
            color: color.text4,
            fontFamily: "inherit",
            fontSize: size.s13,
            cursor: "pointer",
          }}
        >
          {en.chat.followUp}
        </button>
      </div>
      <AnswerBody
        view={view}
        {...(onAsk ? { onAsk } : {})}
        {...(onZoomToSteps ? { onZoomToSteps } : {})}
      />
    </div>
  );
}
