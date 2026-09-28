// SPDX-License-Identifier: Apache-2.0

// The oldest Node.js Codemap runs on: the cache uses node:sqlite, which needs
// no flag from 22.13 on. It is checked before anything that needs it is
// loaded, so an older Node.js gets a sentence, not a stack trace.
export const minimum = { major: 22, minor: 13 } as const;

export function supported(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > minimum.major || (major === minimum.major && minor >= minimum.minor);
}
