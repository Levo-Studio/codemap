// SPDX-License-Identifier: Apache-2.0

import { AnswerBody } from "../components/AskPanel";
import { ask, chatPanel as m } from "../design/metrics";
import { color, size } from "../design/tokens";
import type { AskView } from "../model/view";
import { en } from "../strings/en";

export function ChatSide({
  view,
  onBack,
  onAsk,
  onZoomToSteps,
}: {
  view: AskView;
  onBack: () => void;
  onAsk?: ((question: string) => void) | undefined;
  onZoomToSteps?: (() => void) | undefined;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Same padding as the answer, so the bar aligns. */}
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
            minHeight: m.bar.height,
            display: "flex",
            alignItems: "center",
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
      <AnswerBody view={view} onAsk={onAsk} onZoomToSteps={onZoomToSteps} />
    </div>
  );
}
