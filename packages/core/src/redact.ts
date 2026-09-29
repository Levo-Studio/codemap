// SPDX-License-Identifier: Apache-2.0

// Code sent to a provider to be explained, with the keys pasted into it
// masked: a key in code is a mistake the user may not know about, and one the
// explanation does not need. Only shapes a provider issues are matched, each
// with a fixed prefix, so ordinary code is left exactly as it is.
const shapes = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bAIza[A-Za-z0-9_-]{35}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

const mask = "[key removed by Codemap]";

export function redact(code: string): string {
  return shapes.reduce((text, shape) => text.replace(shape, mask), code);
}
