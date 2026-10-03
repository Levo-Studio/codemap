// SPDX-License-Identifier: Apache-2.0

import { type Analysis, analyse } from "./analyse.js";
import type { Cache } from "./cache.js";
import { live } from "./design.js";
import { languageOf } from "./languages.js";
import { Session } from "./session.js";
import { minutes, seconds } from "./time.js";
import { type ChangeBatch, watch } from "./watch.js";

// The project as it is right now: the latest analysis, the session since the
// start, and a version that goes up with every change so the browser knows its
// map is out of date. Batches are read one at a time; a batch that arrives
// during a read waits and is read next, merged with anything else that
// arrives meanwhile.

export interface LiveProject {
  current(): Analysis;
  readonly session: Session;
  version(): number;
  // Called after every change that has been read, with the new version.
  subscribe(listener: (version: number) => void): () => void;
  close(): Promise<void>;
}

interface LiveOptions {
  cache?: Cache;
  ignoredPaths?: readonly string[];
  // The environment Codemap was started with, used to find git's config.
  env?: NodeJS.ProcessEnv;
  // The root of the repository that contains the project; its ignore rules
  // apply.
  repository?: string;
  // Where changes come from; the project's own file events by default.
  changes?: (onChange: (batch: ChangeBatch) => void) => Promise<{ close(): Promise<void> }>;
}

// Files that decide how code is read: what is ignored, how imports resolve.
const configures = (path: string) =>
  /(^|\/)(\.gitignore|package\.json|[tj]sconfig[^/]*\.json)$/.test(path);

// A change can affect the map if it is code, configuration, or a path without
// an extension, which may be a folder of code.
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
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const announce = () => {
    version++;
    for (const listener of listeners) listener(version);
  };
  let running: Promise<void> | undefined;

  const read = async (batch: ChangeBatch) => {
    // A file that is neither code nor configuration (build output, images,
    // test reports) changes nothing on the map.
    if (!batch.paths.some(mayMatter)) return;
    const before = analysis;
    const after = await analyse(root, {
      previous: before,
      changed: new Set(batch.paths),
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.ignoredPaths ? { ignoredPaths: options.ignoredPaths } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.repository ? { repository: options.repository } : {}),
    });
    analysis = after;
    // A path without an extension may be a folder renamed or removed with its
    // files, so the batch counts only if it touched a file before or after.
    const touched = (of: Analysis) =>
      [...of.graph.files.keys()].some((file) =>
        batch.paths.some((p) => file === p || file.startsWith(`${p}/`)),
      );
    if (!touched(before) && !touched(after) && !batch.paths.some(configures)) return;
    session.record(before, after, batch.paths, batch.at);
    announce();
    // The map's states also change with time alone: editing ends, Changed
    // starts to fade, the marker goes. Each of those moments bumps the
    // version too, so the browser refreshes.
    for (const delay of [
      seconds(live.editingSeconds),
      seconds(live.justNowSeconds),
      minutes(live.keepMinutes),
    ]) {
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          announce();
        },
        Math.max(0, batch.at + delay - Date.now()),
      );
      timer.unref?.();
      timers.add(timer);
    }
  };

  // Paths of a batch whose read failed, carried into the next batch.
  let carried: string[] = [];
  const merge = (a: ChangeBatch, b: ChangeBatch): ChangeBatch => ({
    paths: [...new Set([...a.paths, ...b.paths])],
    at: Math.min(a.at, b.at),
  });

  // Merges the carried paths into a batch and clears them.
  const withCarried = (batch: ChangeBatch): ChangeBatch => {
    if (carried.length === 0) return batch;
    const merged = merge({ paths: carried, at: batch.at }, batch);
    carried = [];
    return merged;
  };

  const take = (incoming: ChangeBatch) => {
    const batch = withCarried(incoming);
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
          // After an unexpected failure the batch's files are read again with
          // the next batch, so their changes are not lost.
          carried = [...new Set([...carried, ...next.paths])];
        }
        next = waiting;
        waiting = undefined;
        // A waiting batch takes over the paths carried from a failed read.
        if (next) next = withCarried(next);
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
      for (const timer of timers) clearTimeout(timer);
      await watching.close();
      await running;
    },
  };
}
