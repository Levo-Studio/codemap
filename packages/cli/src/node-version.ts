// SPDX-License-Identifier: Apache-2.0

const unflagged: Record<number, number> = { 22: 13, 23: 4 };

// node:sqlite needs no flag from 22.13 and 23.4.
export function supported(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major >= 24) return true;
  const from = unflagged[major];
  return from !== undefined && minor >= from;
}
