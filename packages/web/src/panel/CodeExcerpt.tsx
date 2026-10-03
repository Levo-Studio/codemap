// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";
import { panel as m } from "../design/metrics";
import { color, font, lineHeight, radius, rule, size } from "../design/tokens";
import type { CodeView } from "../model/view";
import { en } from "../strings/en";

// The code of the function or file a panel shows, on request: a button, and
// once open the lines with their numbers.

export interface CodeState {
  open: boolean;
  view?: CodeView;
  onToggle: () => void;
}

export const CodeContext = createContext<CodeState | undefined>(undefined);

// The box the code sits in, like the signature's.
export const codeBox = {
  borderRadius: m.signature.radius,
  background: color.field,
  border: rule(color.line1),
  padding: `${m.signature.paddingY}px ${m.signature.paddingX}px`,
  fontFamily: font.mono,
  fontSize: size.s12,
  lineHeight: lineHeight.body,
  color: color.text2,
};

export function CodeExcerpt() {
  const state = useContext(CodeContext);
  if (!state) return null;
  const view = state.view;
  const width = String((view?.startLine ?? 1) + (view?.lines.length ?? 0)).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: m.code.gap }}>
      <button
        type="button"
        onClick={state.onToggle}
        aria-expanded={state.open}
        style={{
          alignSelf: "flex-start",
          background: "none",
          fontFamily: "inherit",
          cursor: "pointer",
          padding: `${m.code.button.paddingY}px ${m.code.button.paddingX}px`,
          borderRadius: radius.md,
          border: rule(color.line2),
          fontSize: size.s12_5,
          color: color.text1,
        }}
      >
        {state.open ? en.panel.hideCode : en.panel.showCode}
      </button>
      {state.open && view && (
        <section
          aria-label={view.path}
          style={{ maxHeight: m.code.height, overflow: "auto", ...codeBox }}
        >
          <pre style={{ margin: 0, fontFamily: "inherit" }}>
            {view.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one excerpt never reorder
              <div key={index} style={{ display: "flex", gap: m.code.numbersGap }}>
                <span style={{ color: color.text4, minWidth: `${width}ch`, textAlign: "right" }}>
                  {view.startLine + index}
                </span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
          {view.cut && (
            <div style={{ color: color.text4, fontFamily: font.sans }}>
              {en.panel.moreCode(view.lines.length)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
