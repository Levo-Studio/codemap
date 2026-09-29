// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

// Made up, in the shapes the providers issue them.
const keys = [
  `sk-ant-api03-${"a".repeat(40)}`,
  `sk-proj-${"B7".repeat(20)}`,
  `AKIA${"ABCDEFGHIJKLMNOP"}`,
  `ghp_${"c".repeat(36)}`,
  `github_pat_${"d".repeat(60)}`,
  `xoxb-${"1".repeat(12)}-${"e".repeat(24)}`,
  `sk_live_${"f".repeat(24)}`,
  `AIza${"g".repeat(35)}`,
  `eyJ${"h".repeat(20)}.eyJ${"i".repeat(20)}.${"j".repeat(20)}`,
];

describe("redact", () => {
  it("masks a key pasted into code, in every shape a provider issues", () => {
    for (const key of keys) {
      const code = `const client = new Client("${key}");`;
      expect(redact(code)).not.toContain(key);
      expect(redact(code)).toContain("const client = new Client(");
    }
  });

  // Code comes from the repository, which may be written to stall it: each
  // of these takes seconds where a shape is tried again from inside a run.
  it.each([
    ["sk-", "sk-".repeat(70_000)],
    ["eyJ-", "eyJ-".repeat(50_000)],
    ["xoxb-", "xoxb-".repeat(40_000)],
    ["key blocks without an end", "-----BEGIN RSA PRIVATE KEY-----\n".repeat(60_000)],
  ])("takes time in step with the code, even for %s over and over", (_, code) => {
    const started = performance.now();
    redact(code);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("masks a private key block, whole", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA",
      "abcdef",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    expect(redact(`const key = \`${pem}\`;`)).not.toMatch(/MIIEow|abcdef/);
  });

  it("leaves code without a key as it is", () => {
    const code =
      "export function charge(amount: number) {\n  return stripe.charges.create({ amount });\n}";
    expect(redact(code)).toBe(code);
    // Class names read like a key's prefix, but a key has digits in it.
    const styled = '<button className="sk-button-primary-large-variant">';
    expect(redact(styled)).toBe(styled);
  });
});
