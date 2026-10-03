// SPDX-License-Identifier: Apache-2.0

// Ids on the map. A function's id is its file path and name,
// "lib/billing.ts#charge"; a link's id is its two ends, "a>b". Where things of
// several kinds share one list, the id starts with the kind,
// "module:lib/billing".

export const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;

// Returns undefined for any id that is not a function's.
export function splitSymbolId(id: string): { path: string; symbol: string } | undefined {
  const hash = id.lastIndexOf("#");
  return hash > 0 ? { path: id.slice(0, hash), symbol: id.slice(hash + 1) } : undefined;
}

export const linkId = (from: string, to: string) => `${from}>${to}`;

export const kindId = (kind: string, id: string) => `${kind}:${id}`;

export const isOfKind = (kind: string, id: string) => id.startsWith(kindId(kind, ""));
