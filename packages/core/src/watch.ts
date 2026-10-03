// SPDX-License-Identifier: Apache-2.0

import { realpath } from "node:fs/promises";
import { relative } from "node:path";
import watcher from "@parcel/watcher";
import { toPosix } from "./paths.js";
import { defaultIgnoredPaths } from "./scan.js";

// The file watcher is the source of truth for what the agent does: every
// change to the project arrives here from the platform's file events. An agent
// writes a file in several steps, often several files at once, so events are
// collected until the project has been quiet for a moment and handed on as one
// batch.

export interface ChangeBatch {
  // Relative to the project root, with forward slashes, in the order first seen.
  paths: string[];
  // When the first change of the batch happened, in milliseconds since 1970.
  at: number;
}

interface WatchOptions {
  ignoredPaths?: readonly string[];
  onChange: (batch: ChangeBatch) => void;
}

export interface Watching {
  close(): Promise<void>;
}

// Milliseconds of quiet before a batch is handed on, and the longest a batch
// waits while changes keep coming: long enough to treat a save of several
// files as one change, short enough to feel live.
const quiet = 120;
const longest = 1000;

export async function watch(root: string, options: WatchOptions): Promise<Watching> {
  // The platform reports real paths. If a symbolic link lies on the way to the
  // root (on macOS the temporary folder is one), every reported path would
  // seem to lie outside it.
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
    // Hidden paths are not ignored wholesale, though none is drawn: a changed
    // .gitignore changes what is read, so the watcher must report it.
    { ignore: [".git", ".codemap", ...(options.ignoredPaths ?? defaultIgnoredPaths)] },
  );

  return {
    async close() {
      clearTimeout(timer);
      clearTimeout(deadline);
      await subscription.unsubscribe();
    },
  };
}

// Starts watching before the first indexing run, because a change made during
// that run would otherwise never arrive. Batches are kept until the live
// project takes over, then handed to it in order.
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
