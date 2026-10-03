// SPDX-License-Identifier: Apache-2.0

// The lookbehind keeps redaction linear in the code's length.
const atKeyStart = (pattern: RegExp) => new RegExp(`(?<![A-Za-z0-9_-])${pattern.source}`, "g");

const hasDigit = (key: string) => /\d/.test(key);

const shapes: [RegExp, (key: string) => boolean][] = [
  [atKeyStart(/sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/), hasDigit],
  [atKeyStart(/(?:AKIA|ASIA)[A-Z0-9]{16}\b/), () => true],
  [atKeyStart(/gh[pousr]_[A-Za-z0-9]{30,}/), () => true],
  [atKeyStart(/github_pat_[A-Za-z0-9_]{40,}/), () => true],
  [atKeyStart(/xox[abposr]-[A-Za-z0-9-]{10,}/), () => true],
  [atKeyStart(/[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/), () => true],
  [atKeyStart(/AIza[A-Za-z0-9_-]{35}/), () => true],
  [atKeyStart(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/), () => true],
];

const mask = "[key removed by Codemap]";

// Each END is searched once, so redaction stays linear.
function withoutKeyBlocks(code: string): string {
  const begin = /-----BEGIN [A-Z ]*PRIVATE KEY-----/g;
  const end = /-----END [A-Z ]*PRIVATE KEY-----/g;
  let out = "";
  let from = 0;
  for (let found = begin.exec(code); found; found = begin.exec(code)) {
    end.lastIndex = found.index;
    const closed = end.exec(code);
    if (!closed) break;
    out += code.slice(from, found.index) + mask;
    from = closed.index + closed[0].length;
    begin.lastIndex = from;
  }
  return out + code.slice(from);
}

export function redact(code: string): string {
  return shapes.reduce(
    (text, [shape, isKey]) => text.replace(shape, (found) => (isKey(found) ? mask : found)),
    withoutKeyBlocks(code),
  );
}
