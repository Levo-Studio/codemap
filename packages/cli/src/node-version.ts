// SPDX-License-Identifier: Apache-2.0

// The Node.js versions Codemap runs on: the cache uses node:sqlite, which
// needs no flag from 22.13 on in the 22 line and from 23.4 on in the 23 line.
// It is checked before anything that needs it is loaded, so an older Node.js
// gets a sentence, not a stack trace.
const unflagged: Record<number, number> = { 22: 13, 23: 4 };

export function supported(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major >= 24) return true;
  const from = unflagged[major];
  return from !== undefined && minor >= from;
}
