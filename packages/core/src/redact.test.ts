// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

// Made up, in the shapes the providers issue them.
const keys = [
  `sk-ant-api03-${"a".repeat(40)}`,
  `sk-proj-${"B".repeat(40)}`,
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
  });
});
