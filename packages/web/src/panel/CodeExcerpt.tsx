// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";
import { press } from "../components/press";
import { panel as m } from "../design/metrics";
import { color, font, lineHeight, radius, rule, size } from "../design/tokens";
import type { CodeView } from "../model/view";
import { en } from "../strings/en";

// The code of the function or file a panel shows, on request: a button, and
// once open the lines with their numbers, in a box like the signature's.

export interface CodeState {
  open: boolean;
  view?: CodeView;
  onToggle: () => void;
}

export const Code = createContext<CodeState | undefined>(undefined);

export function CodeExcerpt() {
  const state = useContext(Code);
  if (!state) return null;
  const width = String((state.view?.startLine ?? 1) + (state.view?.lines.length ?? 0)).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: m.code.gap }}>
      <span
        {...press(state.onToggle)}
        style={{
          alignSelf: "flex-start",
          padding: `${m.code.button.paddingY}px ${m.code.button.paddingX}px`,
          borderRadius: radius.md,
          border: rule(color.line2),
          fontSize: size.s12_5,
          color: color.text1,
        }}
      >
        {state.open ? en.panel.hideCode : en.panel.showCode}
      </span>
      {state.open && state.view && (
        <section
          aria-label={state.view.path}
          style={{
            maxHeight: m.code.height,
            overflow: "auto",
            borderRadius: m.signature.radius,
            background: color.field,
            border: rule(color.line1),
            padding: `${m.signature.paddingY}px ${m.signature.paddingX}px`,
            fontFamily: font.mono,
            fontSize: size.s12,
            lineHeight: lineHeight.body,
            color: color.text2,
          }}
        >
          <pre style={{ margin: 0, fontFamily: "inherit" }}>
            {state.view.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one excerpt never reorder
              <div key={index} style={{ display: "flex", gap: m.code.numbersGap }}>
                <span style={{ color: color.text4, minWidth: `${width}ch`, textAlign: "right" }}>
                  {state.view && state.view.startLine + index}
                </span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
          {state.view.cut && (
            <div style={{ color: color.text4, fontFamily: font.sans }}>{en.panel.moreCode}</div>
          )}
        </section>
      )}
    </div>
  );
}
