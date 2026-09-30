// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { en } from "./en.js";

describe("the terminal catalog", () => {
  // A reason comes from outside: a provider's error, the system's. Written as
  // it came, an escape in it would drive the terminal: retitle the window,
  // move the cursor over what Codemap printed, hide a line.
  it("prints a reason from outside without anything that would drive the terminal", () => {
    const reason = "overloaded\u001b]0;pwned\u0007\u001b[2K\u001b[1A\r\u009b31m";
    for (const line of [
      en.result.explanationsStopped(reason),
      en.setup.failed(reason),
      en.errors.failed(reason),
      en.errors.notADirectory(reason),
      en.errors.notARepository(reason),
      en.errors.hidden(reason),
    ]) {
      expect(line).toContain("overloaded");
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the characters under test
      expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    }
  });
});
