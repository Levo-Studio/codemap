// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { live } from "./design.js";
import { type FileChange, Session } from "./session.js";
import { en } from "./strings/en.js";
import type {
  ChangeItem,
  ChangesPanel,
  MapEdge,
  MapNode,
  MapScreen,
  NodeState,
  RecentChange,
} from "./view.js";

// Puts what the session saw onto a map that was built from the code: which
// nodes the agent is editing, which changed or are new, which connections are
// new, the activity in the panel and the changes timeline. The map itself is
// never changed by this, only its states and texts.

export interface ActivityOptions {
  now?: number;
  // The setting "Keep changed marker for", in minutes.
  keepMinutes?: number;
}

const baseName = (path: string) => path.split("/").at(-1) ?? path;

// The files a node on any level stands for: an area, a module, a file, or a
// function in a file; neighbours carry "in:" or "out:" before their id.
function resolver(analysis: Analysis) {
  const { structure, graph } = analysis;
  const modules = new Map(structure.areas.flatMap((a) => a.modules.map((m) => [m.id, m.files])));
  const areas = new Map(structure.areas.map((a) => [a.id, a.files]));
  return (nodeId: string): { files: string[]; symbol?: string; service?: string } => {
    const id = nodeId.replace(/^(in|out):/, "");
    if (id.startsWith("external:")) return { files: [], service: id };
    const hash = id.lastIndexOf("#");
    if (hash > 0 && graph.files.has(id.slice(0, hash)))
      return { files: [id.slice(0, hash)], symbol: id.slice(hash + 1) };
    if (graph.files.has(id)) return { files: [id] };
    return { files: modules.get(id) ?? areas.get(id) ?? [] };
  };
}

// The latest change among a node's files that a reader of the map would
// notice; a change that only moved lines still counts as the agent editing.
function latest(changes: (FileChange | undefined)[], noticeable: boolean): number | undefined {
  const times = changes
    .filter((c): c is FileChange => !!c && !c.removed && (!noticeable || !c.minor || c.added))
    .map((c) => c.last);
  return times.length > 0 ? Math.max(...times) : undefined;
}

function editingFile(session: Session, now: number): FileChange | undefined {
  const first = session.files()[0];
  return first && !first.removed && now - first.last < live.editingSeconds * 1000
    ? first
    : undefined;
}

export function timeline(
  session: Session,
  analysis: Analysis,
  options: ActivityOptions = {},
): ChangesPanel {
  const now = options.now ?? Date.now();
  const editing = editingFile(session, now);
  const time = (at: number, path?: string) =>
    path && editing?.path === path ? en.panel.now : en.clock(at);
  const sensitive = (path: string) => Session.sensitive(analysis, path);
  const rank = { area: 0, service: 1, module: 3 } as const;

  const structure: (ChangeItem & { rank: number; at: number })[] = session.arrived().map((a) => ({
    id: `${a.kind}:${a.id}`,
    title: en.changes.item[a.kind](a.name),
    time: time(a.at),
    marker: "changed" as const,
    rank: rank[a.kind],
    at: a.at,
  }));
  const behavior: (ChangeItem & { rank: number; at: number })[] = [];
  let minor = 0;
  for (const change of session.files()) {
    const name = baseName(change.path);
    const marker = editing?.path === change.path ? ("editing" as const) : ("changed" as const);
    const parts = [
      ...(change.symbolsAdded.length > 0 ? [en.changes.item.added(change.symbolsAdded)] : []),
      ...(change.symbolsChanged.length > 0 ? [en.changes.item.changed(change.symbolsChanged)] : []),
      ...(change.symbolsRemoved.length > 0 ? [en.changes.item.removed(change.symbolsRemoved)] : []),
    ];
    const line = parts.length > 0 ? { line: en.changes.item.sentences(parts) } : {};
    const item = {
      id: `file:${change.path}`,
      time: time(change.last, change.path),
      marker,
      at: change.last,
    };
    if (change.added || change.removed)
      structure.push({
        ...item,
        ...line,
        title: change.added ? en.changes.item.fileAdded(name) : en.changes.item.fileRemoved(name),
        rank: sensitive(change.path) ? 2 : 4,
      });
    else if (change.minor) minor++;
    else
      behavior.push({
        ...item,
        ...line,
        title: en.changes.item.fileChanged(name),
        rank: sensitive(change.path) ? 0 : 1,
      });
  }
  // Most important first; within the same importance, the latest first.
  const order = <T extends { rank: number; at: number }>(items: T[]) =>
    items
      .sort((a, b) => a.rank - b.rank || b.at - a.at)
      .map(({ rank: _rank, at: _at, ...item }) => item);
  return {
    kind: "changes",
    since: en.clock(session.startedAt),
    minutes: Math.floor((now - session.startedAt) / 60_000),
    structure: order(structure),
    behavior: order(behavior),
    minor,
  };
}

export function withActivity(
  screen: MapScreen,
  analysis: Analysis,
  session: Session,
  options: ActivityOptions = {},
): MapScreen {
  const now = options.now ?? Date.now();
  const keep = (options.keepMinutes ?? live.keepMinutes) * 60_000;
  const filesOf = resolver(analysis);
  const editing = editingFile(session, now);
  const isEditing = (at: number | undefined) =>
    at !== undefined && now - at < live.editingSeconds * 1000;

  const stateOf = (node: MapNode): Partial<MapNode> => {
    const { files, symbol, service } = filesOf(node.id);
    if (service) {
      const at = session.arrivalOf("service", service);
      return at !== undefined && now - at < keep ? { state: "new" } : {};
    }
    const changes = files.map((f) => session.changeOf(f));
    if (symbol) {
      const change = changes[0];
      const record = session.symbol(files[0] as string, symbol);
      if (!record || now - record.changed >= keep) return {};
      if (change && record.changed === change.last && isEditing(change.last))
        return { state: "editing" };
      return record.added ? { state: "new" } : changedState(record.changed);
    }
    const any = latest(changes, false);
    if (isEditing(any))
      return node.kind === "area"
        ? { state: "editing", statusText: en.status.agentEditing }
        : { state: "editing" };
    const kind = node.kind === "area" || node.kind === "module" ? node.kind : undefined;
    const arrived = kind ? session.arrivalOf(kind, node.id.replace(/^(in|out):/, "")) : undefined;
    const fileAdded = node.kind === "file" && changes[0]?.added ? changes[0].first : undefined;
    const born = arrived ?? fileAdded;
    if (born !== undefined && now - born < keep) return { state: "new" };
    const seen = latest(changes, true);
    if (seen === undefined || now - seen >= keep) return {};
    // On the system map an area that gained a module says so.
    if (node.kind === "area") {
      const module = session
        .arrived()
        .find(
          (a) =>
            a.kind === "module" &&
            now - a.at < keep &&
            files.some((f) => analysis.structure.moduleOf.get(f) === a.id),
        );
      if (module) return { ...changedState(seen), statusText: en.status.added(module.name) };
    }
    return changedState(seen);
  };
  function changedState(at: number): Partial<MapNode> {
    const minutes = Math.floor((now - at) / 60_000);
    return now - at < live.justNowSeconds * 1000
      ? { state: "changed" as NodeState }
      : { state: "faded" as NodeState, minutesAgo: Math.max(1, minutes) };
  }

  const nodes = screen.map.nodes.map((node) => {
    const next = stateOf(node);
    return next.state ? { ...node, ...next } : node;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // A connection is new when nothing it stands for existed at the start, and
  // active while the agent is writing in its caller: a call that existed
  // before stays a call, since nothing says the agent writes along it.
  const edges = screen.map.edges.map((edge): MapEdge => {
    if (edge.kind !== "call") return edge;
    const from = filesOf(edge.from);
    const to = filesOf(edge.to);
    let fresh: boolean;
    if (to.service) fresh = session.arrivalOf("service", to.service) !== undefined;
    else if (from.symbol && to.symbol)
      fresh = !session.hadSymbolCall(
        `${from.files[0]}#${from.symbol}`,
        `${to.files[0]}#${to.symbol}`,
      );
    else fresh = !from.files.some((f) => to.files.some((t) => session.hadFileCall(f, t)));
    const changedAt = latest(
      from.files.map((f) => session.changeOf(f)),
      false,
    );
    if (!fresh || changedAt === undefined || now - changedAt >= keep) return edge;
    return byId.get(edge.from)?.state === "editing"
      ? { ...edge, kind: "active", strong: true }
      : { ...edge, kind: "new" };
  });

  const changes = timeline(session, analysis, { now });
  const total = changes.structure.length + changes.behavior.length + changes.minor;
  const recentOf = (files: string[]): RecentChange[] =>
    session
      .files()
      .filter((c) => files.includes(c.path) && !c.minor)
      .slice(0, 3)
      .map((c) => ({
        id: c.path,
        title: en.changes.item.fileChanged(baseName(c.path)),
        time: editing?.path === c.path ? en.panel.now : en.clock(c.last),
      }));

  let panel = screen.panel;
  if (panel.kind === "project") {
    const where = editing
      ? [
          analysis.structure.areas.find((a) => a.id === analysis.structure.areaOf.get(editing.path))
            ?.name,
          baseName(editing.path),
        ]
          .filter(Boolean)
          .join(en.meta.path)
      : undefined;
    panel = {
      ...panel,
      activity: where ? [{ id: "editing", kind: "editing", where }] : [],
      session: [...changes.structure, ...changes.behavior]
        .slice(0, 2)
        .map(({ id, title, time }) => ({ id, title, time })),
      totalChanges: total,
    };
  } else if (panel.kind === "module") {
    // The panel is the selected node's, or the container's around the map.
    const selected = nodes.find((n) => n.selected);
    const shown = selected ? [selected] : nodes.filter((n) => !/^(in|out):/.test(n.id));
    const files = [...new Set(shown.flatMap((n) => filesOf(n.id).files))];
    panel = {
      ...panel,
      badges: {
        ...panel.badges,
        ...(editing && files.includes(editing.path) ? { editing: true } : {}),
      },
      recent: recentOf(files),
    };
  } else if (panel.kind === "file") {
    panel = {
      ...panel,
      functions: panel.functions.map((row) => {
        const state = byId.get(row.id)?.state;
        return state === "editing" || state === "new" ? { ...row, status: state } : row;
      }),
    };
  }

  return {
    ...screen,
    topbar: { ...screen.topbar, changes: total },
    map: { ...screen.map, nodes, edges },
    panel,
    chat: "kind" in screen.chat && editing ? { kind: "editing", file: editing.path } : screen.chat,
  };
}
