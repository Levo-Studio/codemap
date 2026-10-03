// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { CodeView, Screen } from "../model/view";
import type { CodeState } from "../panel/CodeExcerpt";
import { getJson } from "./api";

// Uses the selection, since the previous panel shows until replaced.
export function codeTarget(screen: Screen | null, select: string | undefined) {
  if (screen?.kind !== "map" || !select) return undefined;
  if (select.includes("#")) {
    const at = select.lastIndexOf("#");
    return new URLSearchParams({
      file: select.slice(0, at),
      symbol: select.slice(at + 1),
    }).toString();
  }
  return screen.panel.kind === "file"
    ? new URLSearchParams({ file: select }).toString()
    : undefined;
}

export function useCode(freshness: number) {
  const [codeFor, setCodeFor] = useState<string | undefined>();
  const [code, setCode] = useState<{ target: string; view: CodeView } | undefined>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: freshness only asks for a new fetch
  useEffect(() => {
    if (codeFor === undefined) return;
    const target = codeFor;
    let current = true;
    getJson<CodeView>(`/api/code?${target}`)
      .then((view) => {
        if (!current) return;
        if (view) setCode({ target, view });
        else setCodeFor(undefined);
      })
      .catch(() => {
        if (current) setCodeFor(undefined);
      });
    return () => {
      current = false;
    };
  }, [codeFor, freshness]);

  return (target: string | undefined): CodeState | undefined => {
    if (!target) return undefined;
    const open = codeFor === target;
    return {
      open,
      ...(open && code?.target === target ? { view: code.view } : {}),
      onToggle: () => setCodeFor(open ? undefined : target),
    };
  };
}
