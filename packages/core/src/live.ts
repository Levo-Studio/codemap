// SPDX-License-Identifier: Apache-2.0

import { type Analysis, analyse } from "./analyse.js";
import type { Cache } from "./cache.js";
import { Session } from "./session.js";
import { type ChangeBatch, watch } from "./watch.js";

// The project as it is right now: the latest analysis, the session since the
// start, and a version that goes up with every change, so the browser knows
// its map is out of date. Batches are taken in one after another; a batch
// that arrives while the last is being read waits and is read next, together
// with anything that arrives in the meantime.

export interface LiveProject {
  current(): Analysis;
  readonly session: Session;
  version(): number;
  // Called after every change that has been read, with the new version.
  subscribe(listener: (version: number) => void): () => void;
  close(): Promise<void>;
}

export interface LiveOptions {
  cache?: Cache;
  ignoredPaths?: readonly string[];
  // Where changes come from; the project's own file events by default.
  changes?: (onChange: (batch: ChangeBatch) => void) => Promise<{ close(): Promise<void> }>;
}

export async function startLive(
  root: string,
  start: Analysis,
  options: LiveOptions = {},
): Promise<LiveProject> {
  let analysis = start;
  let version = 0;
  const session = new Session(start);
  const listeners = new Set<(version: number) => void>();
  let waiting: ChangeBatch | undefined;
  let running: Promise<void> | undefined;

  const read = async (batch: ChangeBatch) => {
    const before = analysis;
    const after = await analyse(root, {
      previous: before,
      changed: new Set(batch.paths),
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.ignoredPaths ? { ignoredPaths: options.ignoredPaths } : {}),
    });
    analysis = after;
    session.record(before, after, batch.paths, batch.at);
    version++;
    for (const listener of listeners) listener(version);
  };

  const take = (batch: ChangeBatch) => {
    if (running) {
      waiting = waiting
        ? { paths: [...new Set([...waiting.paths, ...batch.paths])], at: waiting.at }
        : batch;
      return;
    }
    running = (async () => {
      let next: ChangeBatch | undefined = batch;
      while (next) {
        try {
          await read(next);
        } catch {
          // A file that vanished while it was read is read again with the
          // next batch; nothing is lost by skipping this one.
        }
        next = waiting;
        waiting = undefined;
      }
      running = undefined;
    })();
  };

  const source =
    options.changes ??
    ((onChange) =>
      watch(root, {
        onChange,
        ...(options.ignoredPaths ? { ignoredPaths: options.ignoredPaths } : {}),
      }));
  const watching = await source(take);

  return {
    current: () => analysis,
    session,
    version: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      await watching.close();
      await running;
    },
  };
}
