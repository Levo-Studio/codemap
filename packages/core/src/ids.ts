// SPDX-License-Identifier: Apache-2.0

export const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;

export function splitSymbolId(id: string): { path: string; symbol: string } | undefined {
  const hash = id.lastIndexOf("#");
  return hash > 0 ? { path: id.slice(0, hash), symbol: id.slice(hash + 1) } : undefined;
}

export const linkId = (from: string, to: string) => `${from}>${to}`;

export const kindId = (kind: string, id: string) => `${kind}:${id}`;

export const isOfKind = (kind: string, id: string) => id.startsWith(kindId(kind, ""));
