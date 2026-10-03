// SPDX-License-Identifier: Apache-2.0

import type { Explanation } from "../model/view";

export function getJson<T>(url: string): Promise<T | undefined> {
  return fetch(url).then((response) => (response.ok ? (response.json() as Promise<T>) : undefined));
}

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
