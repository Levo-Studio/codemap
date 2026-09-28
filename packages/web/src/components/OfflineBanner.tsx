// SPDX-License-Identifier: Apache-2.0

import { offline as m } from "../design/metrics";
import { color, radius, rule, size, weight } from "../design/tokens";
import { en } from "../strings/en";

// Shown when the browser loses the local server: most often codemap was
// stopped in the terminal, so the banner says where to look.
export function OfflineBanner({ retryIn }: { retryIn: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: m.bannerTop,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: m.banner.gap,
        padding: `${m.banner.paddingY}px ${m.banner.paddingRight}px ${m.banner.paddingY}px ${m.banner.paddingLeft}px`,
        borderRadius: m.banner.radius,
        background: color.float,
        border: rule(color.err),
        boxShadow: color.shadowFloating,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: color.err, fontSize: m.banner.glyph }}>{en.glyph.error}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: m.banner.textGap }}>
        <span style={{ fontWeight: weight.semibold, fontSize: size.s13_5 }}>
          {en.offline.title}
        </span>
        <span style={{ fontSize: size.s12_5, color: color.text3 }}>
          {en.offline.retrying(retryIn)}
        </span>
      </div>
      <span
        style={{
          padding: `${m.retry.paddingY}px ${m.retry.paddingX}px`,
          borderRadius: radius.md,
          background: color.text1,
          color: color.inv,
          fontWeight: weight.medium,
        }}
      >
        {en.offline.retry}
      </span>
    </div>
  );
}
