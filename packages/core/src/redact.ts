// SPDX-License-Identifier: Apache-2.0

// Code sent to a provider to be explained, with the keys pasted into it
// masked: a key in code is a mistake the user may not know about, and one the
// explanation does not need. Only shapes a provider issues are matched, each
// with a fixed prefix, so ordinary code is left exactly as it is.
// Each shape is matched in time in step with the code: a repository can
// write its code to stall a pattern that looks back and forth.
const shapes: [RegExp, (key: string) => boolean][] = [
  // A key has digits in it; a class name such as sk-button-primary does not.
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, (key) => /\d/.test(key)],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, () => true],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, () => true],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g, () => true],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, () => true],
  [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g, () => true],
  [/\bAIza[A-Za-z0-9_-]{35}/g, () => true],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, () => true],
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
