// SPDX-License-Identifier: Apache-2.0

import { type Analysis, analyse } from "./analyse.js";
import type { Cache } from "./cache.js";
import { live } from "./design.js";
import { languageOf } from "./languages.js";
import { Session } from "./session.js";
import { minutes, seconds } from "./time.js";
import { type ChangeBatch, watch } from "./watch.js";

export interface LiveProject {
  current(): Analysis;
  readonly session: Session;
  version(): number;
  subscribe(listener: (version: number) => void): () => void;
  close(): Promise<void>;
}

interface LiveOptions {
  cache?: Cache;
  ignoredPaths?: readonly string[];
  env?: NodeJS.ProcessEnv;
  repository?: string;
  changes?: (onChange: (batch: ChangeBatch) => void) => Promise<{ close(): Promise<void> }>;
}

const configures = (path: string) =>
  /(^|\/)(\.gitignore|package\.json|[tj]sconfig[^/]*\.json)$/.test(path);

const mayMatter = (path: string) =>
  languageOf(path) !== undefined || configures(path) || !/\.[^/]+$/.test(path);

const touchesFile = (of: Analysis, paths: readonly string[]) =>
  [...of.graph.files.keys()].some((file) =>
    paths.some((p) => file === p || file.startsWith(`${p}/`)),
  );

// States also age with time, so the browser must refresh.
function announceWhenStatesAge(
  at: number,
  timers: Set<ReturnType<typeof setTimeout>>,
  announce: () => void,
): void {
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
      Math.max(0, at + delay - Date.now()),
    );
    timer.unref?.();
    timers.add(timer);
  }
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
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const announce = () => {
    version++;
    for (const listener of listeners) listener(version);
  };
  let running: Promise<void> | undefined;

  const read = async (batch: ChangeBatch) => {
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
    if (
      !touchesFile(before, batch.paths) &&
      !touchesFile(after, batch.paths) &&
      !batch.paths.some(configures)
    )
      return;
    session.record(before, after, batch.paths, batch.at);
    announce();
    announceWhenStatesAge(batch.at, timers, announce);
  };

  let carried: string[] = [];
  const merge = (a: ChangeBatch, b: ChangeBatch): ChangeBatch => ({
    paths: [...new Set([...a.paths, ...b.paths])],
    at: Math.min(a.at, b.at),
  });

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
          // A failed batch is read again with the next one.
          carried = [...new Set([...carried, ...next.paths])];
        }
        next = waiting;
        waiting = undefined;
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
