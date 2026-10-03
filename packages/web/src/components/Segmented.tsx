// SPDX-License-Identifier: Apache-2.0

import { segmented as m } from "../design/metrics";
import { color, radius, size } from "../design/tokens";
import { press } from "./press";

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  width?: "wide" | "narrow";
  onChange?: ((value: T) => void) | undefined;
}

// The active segment sits on line-2; the others are text-4 on the field.
export function Segmented<T extends string>({
  options,
  value,
  width = "wide",
  onChange,
}: SegmentedProps<T>) {
  const pad = m[width];
  return (
    <div
      style={{
        display: "flex",
        padding: m.padding,
        borderRadius: radius.md,
        background: color.field,
        fontSize: size.s12_5,
        width: "max-content",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <span
            key={option.value}
            {...press(onChange && !active ? () => onChange(option.value) : undefined)}
            style={{
              padding: `${pad.paddingY}px ${pad.paddingX}px`,
              ...(active
                ? { borderRadius: m.segmentRadius, background: color.line2 }
                : { color: color.text4 }),
            }}
          >
            {option.label}
          </span>
        );
      })}
    </div>
  );
}
