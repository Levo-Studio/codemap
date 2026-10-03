// SPDX-License-Identifier: Apache-2.0

// How the map names what is on it. A function's id is its file's path and its
// name, "lib/billing.ts#charge"; a link's is its two ends, "a>b"; and where
// things of several kinds share one list, an id says its kind first,
// "module:lib/billing".

export const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;

// The file and the name in a function's id; undefined for any other id.
export function splitSymbolId(id: string): { path: string; symbol: string } | undefined {
  const hash = id.lastIndexOf("#");
  return hash > 0 ? { path: id.slice(0, hash), symbol: id.slice(hash + 1) } : undefined;
}

export const linkId = (from: string, to: string) => `${from}>${to}`;

export const kindId = (kind: string, id: string) => `${kind}:${id}`;

export const isOfKind = (id: string, kind: string) => id.startsWith(kindId(kind, ""));
