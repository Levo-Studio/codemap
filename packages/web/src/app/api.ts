// SPDX-License-Identifier: Apache-2.0

import type { Explanation } from "../model/view";

// What the local server answers as JSON, or nothing when it refuses.
export function getJson<T>(url: string): Promise<T | undefined> {
  return fetch(url).then((response) => (response.ok ? (response.json() as Promise<T>) : undefined));
}

// The query that asks the server for the map, and for an answer about it.
export function mapParams(
  open: readonly string[],
  changes: boolean,
  select?: string,
  explanation: Explanation = "simple",
  chat?: string,
): string {
  const params = new URLSearchParams();
  for (const id of open) params.append("open", id);
  if (changes) params.set("panel", "changes");
  if (select) params.set("select", select);
  if (explanation === "technical") params.set("explain", "technical");
  if (chat) params.set("chat", chat);
  return params.toString();
}
