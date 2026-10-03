// SPDX-License-Identifier: Apache-2.0

import { font, tracking, weight } from "../design/tokens";
import { en } from "../strings/en";

export function Wordmark({ size }: { size: number }) {
  return (
    <span
      style={{
        fontFamily: font.sans,
        fontWeight: weight.semibold,
        fontSize: size,
        letterSpacing: tracking.display,
      }}
    >
      {en.product}
    </span>
  );
}
