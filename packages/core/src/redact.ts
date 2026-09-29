// SPDX-License-Identifier: Apache-2.0

// Code sent to a provider to be explained, with the keys pasted into it
// masked: a key in code is a mistake the user may not know about, and one the
// explanation does not need. Only shapes a provider issues are matched, each
// with a fixed prefix, so ordinary code is left exactly as it is.
// Each shape starts only where a run of key characters starts, never again
// from inside one: a repository can write a run such as "eyJ-eyJ-…" in which
// a shape tried from every place would read to its end each time. Matched
// this way, the time taken is in step with the code.
const shapes: [RegExp, (key: string) => boolean][] = [
  // A key has digits in it; a class name such as sk-button-primary does not.
  [/(?<![A-Za-z0-9_-])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, (key) => /\d/.test(key)],
  [/(?<![A-Za-z0-9_-])(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, () => true],
  [/(?<![A-Za-z0-9_-])gh[pousr]_[A-Za-z0-9]{30,}/g, () => true],
  [/(?<![A-Za-z0-9_-])github_pat_[A-Za-z0-9_]{40,}/g, () => true],
  [/(?<![A-Za-z0-9_-])xox[abposr]-[A-Za-z0-9-]{10,}/g, () => true],
  [/(?<![A-Za-z0-9_-])[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g, () => true],
  [/(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{35}/g, () => true],
  [
    /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    () => true,
  ],
];

const mask = "[key removed by Codemap]";

// A private key block, from its BEGIN line to its END line. Found by looking
// for the END once after each BEGIN, never again from every BEGIN, so a file
// of BEGIN lines without an END is read once.
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
