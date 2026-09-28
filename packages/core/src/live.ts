// SPDX-License-Identifier: Apache-2.0

import { type Analysis, analyse } from "./analyse.js";
import type { Cache } from "./cache.js";
import { languageOf } from "./languages.js";
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

// Files that decide how code is read: what is ignored, how imports resolve.
const configures = (path: string) =>
  /(^|\/)(\.gitignore|package\.json|[tj]sconfig[^/]*\.json)$/.test(path);

// Whether a change at this path could change the map: code, configuration,
// or a path without an extension, which may be a folder of code.
const mayMatter = (path: string) =>
  languageOf(path) !== undefined || configures(path) || !/\.[^/]+$/.test(path);

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
    // A file that is neither code nor what decides how code is read (build
    // output, images, test reports) changes nothing on the map.
    if (!batch.paths.some(mayMatter)) return;
    const before = analysis;
    const after = await analyse(root, {
      previous: before,
      changed: new Set(batch.paths),
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.ignoredPaths ? { ignoredPaths: options.ignoredPaths } : {}),
    });
    analysis = after;
    // A path without an extension may be a folder, and a folder may have
    // been renamed or removed with its files; the files decide.
    const touched = (of: Analysis) =>
      [...of.graph.files.keys()].some((file) =>
        batch.paths.some((p) => file === p || file.startsWith(`${p}/`)),
      );
    if (!touched(before) && !touched(after) && !batch.paths.some(configures)) return;
    session.record(before, after, batch.paths, batch.at);
    version++;
    for (const listener of listeners) listener(version);
  };

  // The paths of a batch whose read failed, carried into the next one.
  let carried: string[] = [];
  const merge = (a: ChangeBatch, b: ChangeBatch): ChangeBatch => ({
    paths: [...new Set([...a.paths, ...b.paths])],
    at: Math.min(a.at, b.at),
  });

  const take = (incoming: ChangeBatch) => {
    const batch =
      carried.length > 0 ? merge({ paths: carried, at: incoming.at }, incoming) : incoming;
    carried = [];
    if (running) {
      waiting = waiting ? merge(waiting, batch) : batch;
      return;
    }
    running = (async () => {
      let next: ChangeBatch | undefined = batch;
      while (next) {
        try {
          await read(next);
        } catch {
          // An unexpected failure: the batch's files are read again with the
          // next batch, so what they say now is not lost.
          carried = [...new Set([...carried, ...next.paths])];
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
