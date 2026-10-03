// SPDX-License-Identifier: Apache-2.0

import { realpath } from "node:fs/promises";
import { relative } from "node:path";
import watcher from "@parcel/watcher";
import { toPosix } from "./paths.js";
import { defaultIgnoredPaths } from "./scan.js";

export interface ChangeBatch {
  paths: string[];
  at: number;
}

interface WatchOptions {
  ignoredPaths?: readonly string[];
  onChange: (batch: ChangeBatch) => void;
}

export interface Watching {
  close(): Promise<void>;
}

const quiet = 120;
const longest = 1000;

// Other hidden paths stay watched: a .gitignore change matters.
const unwatched = (ignoredPaths: readonly string[] | undefined) => [
  ".git",
  ".codemap",
  ...(ignoredPaths ?? defaultIgnoredPaths),
];

export async function watch(root: string, options: WatchOptions): Promise<Watching> {
  // Real paths, since a symlinked root would put events outside.
  const base = await realpath(root);
  let pending: string[] = [];
  let first = 0;
  let timer: NodeJS.Timeout | undefined;
  let deadline: NodeJS.Timeout | undefined;

  const flush = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    timer = undefined;
    deadline = undefined;
    if (pending.length === 0) return;
    const batch = { paths: pending, at: first };
    pending = [];
    options.onChange(batch);
  };

  const subscription = await watcher.subscribe(
    base,
    (error, events) => {
      if (error) return;
      for (const event of events) {
        const path = toPosix(relative(base, event.path));
        if (path === "" || path.startsWith("..")) continue;
        if (pending.length === 0) first = Date.now();
        if (!pending.includes(path)) pending.push(path);
      }
      if (pending.length === 0) return;
      clearTimeout(timer);
      timer = setTimeout(flush, quiet);
      deadline ??= setTimeout(flush, longest);
    },
    { ignore: unwatched(options.ignoredPaths) },
  );

  return {
    async close() {
      clearTimeout(timer);
      clearTimeout(deadline);
      await subscription.unsubscribe();
    },
  };
}

// Changes during the first indexing run would otherwise be lost.
export async function watchEarly(
  root: string,
  options: Omit<WatchOptions, "onChange"> = {},
): Promise<{
  changes: (onChange: (batch: ChangeBatch) => void) => Promise<Watching>;
  close(): Promise<void>;
}> {
  const early: ChangeBatch[] = [];
  let forward: ((batch: ChangeBatch) => void) | undefined;
  const watching = await watch(root, {
    ...options,
    onChange: (batch) => (forward ? forward(batch) : early.push(batch)),
  });
  return {
    async changes(onChange) {
      forward = onChange;
      for (const batch of early.splice(0)) onChange(batch);
      return watching;
    },
    close: () => watching.close(),
  };
}
