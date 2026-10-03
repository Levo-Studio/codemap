// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { live, shown } from "./design.js";
import { isOfKind, kindId, splitSymbolId } from "./ids.js";
import { baseName } from "./paths.js";
import { isSensitive } from "./services.js";
import { editingFile, type FileChange, type Session } from "./session.js";
import { en } from "./strings/en.js";
import { minutes, minutesIn, seconds } from "./time.js";
import type {
  ChangeItem,
  ChangesPanel,
  MapEdge,
  MapNode,
  MapScreen,
  RecentChange,
} from "./view.js";

// Puts what the session saw onto a map built from the code: which nodes the
// agent is editing, which changed or are new, which connections are new, the
// activity in the panel and the changes timeline. Only the map's states and
// texts change, never its nodes or layout.

interface ActivityOptions {
  now?: number;
  // The setting "Keep changed marker for", in minutes.
  keepMinutes?: number;
}

// The order within each group of the timeline, lowest first. Structure: a new
// area, a new service, an added or removed file that touches the database or
// authentication, a new module, then any other file. Behaviour: changes that
// touch the database or authentication come first.
const rank = {
  structure: { area: 0, service: 1, sensitiveFile: 2, module: 3, file: 4 },
  behavior: { sensitive: 0, other: 1 },
} as const;

interface NodeFiles {
  files: string[];
  symbol?: string;
  service?: string;
}

// The files a node stands for: an area, a module, a file, or a function in a
// file.
function resolver(analysis: Analysis) {
  const { structure, graph } = analysis;
  const modules = new Map(structure.areas.flatMap((a) => a.modules.map((m) => [m.id, m.files])));
  const areas = new Map(structure.areas.map((a) => [a.id, a.files]));
  return (id: string): NodeFiles => {
    if (isOfKind("external", id)) return { files: [], service: id };
    const fn = splitSymbolId(id);
    if (fn && graph.files.has(fn.path)) return { files: [fn.path], symbol: fn.symbol };
    if (graph.files.has(id)) return { files: [id] };
    return { files: modules.get(id) ?? areas.get(id) ?? [] };
  };
}

// The time of the latest change among a node's files. With `noticeable`, a
// change that only moved lines is skipped unless the file is new; without it,
// such a change counts, since it still means the agent is editing.
function latest(changes: (FileChange | undefined)[], noticeable: boolean): number | undefined {
  const times = changes
    .filter((c): c is FileChange => !!c && !c.removed && (!noticeable || !c.minor || c.added))
    .map((c) => c.last);
  return times.length > 0 ? Math.max(...times) : undefined;
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
  const sensitive = (path: string) => isSensitive(analysis, path);

  const structure: (ChangeItem & { rank: number; at: number })[] = session.arrived().map((a) => ({
    id: kindId(a.kind, a.id),
    title: en.changes.item[a.kind](a.name),
    time: time(a.at),
    marker: "changed" as const,
    rank: rank.structure[a.kind],
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
      id: kindId("file", change.path),
      time: time(change.last, change.path),
      marker,
      at: change.last,
    };
    if (change.added || change.removed)
      structure.push({
        ...item,
        ...line,
        title: change.added ? en.changes.item.fileAdded(name) : en.changes.item.fileRemoved(name),
        rank: sensitive(change.path) ? rank.structure.sensitiveFile : rank.structure.file,
      });
    else if (change.minor) minor++;
    else
      behavior.push({
        ...item,
        ...line,
        title: en.changes.item.fileChanged(name),
        rank: sensitive(change.path) ? rank.behavior.sensitive : rank.behavior.other,
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
    minutes: minutesIn(now - session.startedAt),
    structure: order(structure),
    behavior: order(behavior),
    minor,
  };
}

// What the activity pass reads: the session at one moment, how long its marks
// last, and the file being edited at that moment.
interface Moment {
  analysis: Analysis;
  session: Session;
  now: number;
  // How long a change keeps its mark, in milliseconds.
  keep: number;
  filesOf: ReturnType<typeof resolver>;
  editing: FileChange | undefined;
}

function isEditing({ now }: Moment, at: number | undefined): boolean {
  return at !== undefined && now - at < seconds(live.editingSeconds);
}

function changedState({ now }: Moment, at: number): Partial<MapNode> {
  return now - at < seconds(live.justNowSeconds)
    ? { state: "changed" }
    : { state: "faded", minutesAgo: Math.max(1, minutesIn(now - at)) };
}

// The state a node takes from the session, if any.
function stateOf(moment: Moment, node: MapNode): Partial<MapNode> {
  const { session, now, keep } = moment;
  const { files, symbol, service } = moment.filesOf(node.id);
  if (service) {
    const at = session.arrivalOf("service", service);
    return at !== undefined && now - at < keep ? { state: "new" } : {};
  }
  const changes = files.map((f) => session.changeOf(f));
  if (symbol) {
    const change = changes[0];
    const record = session.symbol(files[0] as string, symbol);
    if (!record || now - record.changed >= keep) return {};
    if (change && record.changed === change.last && isEditing(moment, change.last))
      return { state: "editing" };
    return record.added ? { state: "new" } : changedState(moment, record.changed);
  }
  const any = latest(changes, false);
  if (isEditing(moment, any))
    return node.kind === "area"
      ? { state: "editing", statusText: en.status.agentEditing }
      : { state: "editing" };
  const kind = node.kind === "area" || node.kind === "module" ? node.kind : undefined;
  const arrived = kind ? session.arrivalOf(kind, node.id) : undefined;
  const fileAdded = node.kind === "file" && changes[0]?.added ? changes[0].first : undefined;
  const born = arrived ?? fileAdded;
  if (born !== undefined && now - born < keep) return { state: "new" };
  const seen = latest(changes, true);
  if (seen === undefined || now - seen >= keep) return {};
  if (node.kind === "area") {
    const module = moduleAddedTo(moment, files);
    if (module) return { ...changedState(moment, seen), statusText: en.status.added(module.name) };
  }
  return changedState(moment, seen);
}

// On the system map, an area that gained a module names it.
function moduleAddedTo({ analysis, session, now, keep }: Moment, files: string[]) {
  return session
    .arrived()
    .find(
      (a) =>
        a.kind === "module" &&
        now - a.at < keep &&
        files.some((f) => analysis.structure.moduleOf.get(f) === a.id),
    );
}

// A connection is new when nothing it stands for existed at the start, and
// active while the agent is editing its caller. A call that existed before
// stays a plain call: editing the caller does not mean the agent works on it.
function edgeWithActivity(
  { session, now, keep, filesOf }: Moment,
  edge: MapEdge,
  byId: ReadonlyMap<string, MapNode>,
): MapEdge {
  if (edge.kind !== "call") return edge;
  const from = filesOf(edge.from);
  const to = filesOf(edge.to);
  const fresh = isNewCall(session, edge, from, to);
  const changedAt = latest(
    from.files.map((f) => session.changeOf(f)),
    false,
  );
  if (!fresh || changedAt === undefined || now - changedAt >= keep) return edge;
  return byId.get(edge.from)?.state === "editing"
    ? { ...edge, kind: "active", strong: true }
    : { ...edge, kind: "new" };
}

// A function's node id is its symbol id, which the session keeps calls by.
function isNewCall(session: Session, edge: MapEdge, from: NodeFiles, to: NodeFiles): boolean {
  if (to.service) return session.arrivalOf("service", to.service) !== undefined;
  if (from.symbol && to.symbol) return !session.hadSymbolCall(edge.from, edge.to);
  return !from.files.some((f) => to.files.some((t) => session.hadFileCall(f, t)));
}

// Adds the session's view to the panel: the agent's activity and the session's
// changes for the project, recent changes for a node, and the states of a
// file's functions.
function panelWithActivity(
  { analysis, session, filesOf, editing }: Moment,
  screen: MapScreen,
  nodes: MapNode[],
  byId: ReadonlyMap<string, MapNode>,
  changes: ChangesPanel,
  total: number,
): MapScreen["panel"] {
  const recentOf = (files: string[]): RecentChange[] =>
    session
      .files()
      .filter((c) => files.includes(c.path) && !c.minor)
      .slice(0, shown.recentChanges)
      .map((c) => ({
        id: c.path,
        title: en.changes.item.fileChanged(baseName(c.path)),
        time: editing?.path === c.path ? en.panel.now : en.clock(c.last),
      }));

  const panel = screen.panel;
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
    return {
      ...panel,
      activity: where ? [{ id: "editing", kind: "editing", where }] : [],
      session: [...changes.structure, ...changes.behavior]
        .slice(0, shown.sessionChanges)
        .map(({ id, title, time }) => ({ id, title, time })),
      totalChanges: total,
    };
  }
  if (panel.kind === "module") {
    const selected = selectedOpenedOrNot(screen, nodes);
    const files = selected ? filesOf(selected).files : [];
    return {
      ...panel,
      badges: {
        ...panel.badges,
        ...(editing && files.includes(editing.path) ? { editing: true } : {}),
      },
      recent: recentOf(files),
    };
  }
  if (panel.kind === "file")
    return {
      ...panel,
      functions: panel.functions.map((row) => {
        const state = byId.get(row.id)?.state;
        return state === "editing" || state === "new" ? { ...row, status: state } : row;
      }),
    };
  return panel;
}

function selectedOpenedOrNot(screen: MapScreen, nodes: MapNode[]): string | undefined {
  return nodes.find((n) => n.selected)?.id ?? screen.map.opened?.find((o) => o.selected)?.id;
}

export function withActivity(
  screen: MapScreen,
  analysis: Analysis,
  session: Session,
  options: ActivityOptions = {},
): MapScreen {
  const now = options.now ?? Date.now();
  const moment: Moment = {
    analysis,
    session,
    now,
    keep: minutes(options.keepMinutes ?? live.keepMinutes),
    filesOf: resolver(analysis),
    editing: editingFile(session, now),
  };
  const nodes = screen.map.nodes.map((node) => {
    const next = stateOf(moment, node);
    return next.state ? { ...node, ...next } : node;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = screen.map.edges.map((edge) => edgeWithActivity(moment, edge, byId));
  const changes = timeline(session, analysis, { now });
  const total = changes.structure.length + changes.behavior.length + changes.minor;
  const { editing } = moment;
  return {
    ...screen,
    topbar: { ...screen.topbar, changes: total },
    map: { ...screen.map, nodes, edges },
    panel: panelWithActivity(moment, screen, nodes, byId, changes, total),
    chat: "kind" in screen.chat && editing ? { kind: "editing", file: editing.path } : screen.chat,
  };
}
