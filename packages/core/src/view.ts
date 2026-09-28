// SPDX-License-Identifier: Apache-2.0

// What the interface draws, shared by the server that builds it and the
// browser that renders it. Everything here is already resolved: a node knows
// its state and its place, an edge its kind and its route. The static fixture
// fills it from the design; the index fills it from real code. The components
// never decide what something means, only how it looks.

export type Level = "system" | "area" | "file" | "function";

export type NodeKind = "area" | "module" | "file" | "function" | "external";

// The fourteen states of 04 Map Language. "Editing + error" is editing with
// `error`, "Answer step" is any state with `step`, so twelve names cover them.
export type NodeState =
  | "default"
  | "hover"
  | "selected"
  | "editing"
  | "reading"
  | "changed"
  | "faded"
  | "new"
  | "error"
  | "search"
  | "dimmed"
  | "unexplored";

// A place on the map the interface can go to: a level and, below the system,
// what it is inside of (an area, a module, a file).
export interface PlaceRef {
  level: Level;
  id?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapNode extends Rect {
  id: string;
  kind: NodeKind;
  label: string;
  // Second line: a count, a path or a line number, unless a status replaces it.
  meta: string;
  // The plain-language explanation a function node carries.
  description?: string;
  state: NodeState;
  // Replaces the default status word of the state, e.g. "● Agent editing".
  statusText?: string;
  // The error corner badge, shown on top of any state.
  error?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  // The number of an Ask answer step.
  step?: number;
  // For the fading changed state: how long ago the change was.
  minutesAgo?: number;
  // For the error state: how many tests fail.
  failingTests?: number;
  // Where opening this node leads, when it leads anywhere.
  opens?: PlaceRef;
}

// 04 Map Language's connection types, resolved for drawing. Two-way calls are
// two edges; routing is the points themselves.
export type EdgeKind = "call" | "active" | "new" | "path" | "dimmed" | "bundled";

export interface Point {
  x: number;
  y: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  // An orthogonal route from the caller's border to the callee's border. The
  // arrowhead sits on the last point.
  points: Point[];
  // How many calls a bundled edge stands for.
  count?: number;
  // Drawn at the heavier 1.75 stroke: an active edge, an answer path, and an
  // active edge that an Ask answer has dimmed, which keeps its weight.
  strong?: boolean;
}

export interface ColumnLabel {
  id: string;
  label: string;
  x: number;
}

// The one filled container on screen: the area, module or file you are in.
export interface Container extends Rect {
  title: string;
  meta: string;
  // A file's name is code and is set in the mono face.
  mono?: boolean;
}

export interface MapView {
  level: Level;
  columns: ColumnLabel[];
  container?: Container;
  nodes: MapNode[];
  edges: MapEdge[];
}

export type ConnectionStatus = "live" | "offline" | "indexing";

export interface TopbarView {
  project: string;
  crumbs: string[];
  // Where each crumb leads, in the same order.
  trail?: PlaceRef[];
  status: ConnectionStatus;
  changes: number;
  changesOpen: boolean;
}

export type Explanation = "simple" | "technical";

// Something named in a list, with the id that tells two of the same name apart.
export interface Named {
  id: string;
  name: string;
}

export interface Relation {
  id: string;
  name: string;
  note?: string;
  // The note is live activity ("writing now") and takes the editing colour.
  live?: boolean;
}

export interface RecentChange {
  id: string;
  title: string;
  time: string;
  added?: number;
  removed?: number;
}

export type ActivityKind = "editing" | "reading";

export interface Activity {
  id: string;
  kind: ActivityKind;
  where: string;
}

export interface SessionChange {
  id: string;
  title: string;
  time: string;
}

export interface ProjectPanel {
  kind: "project";
  name: string;
  meta: string;
  explanation: Explanation;
  text: string;
  activityTime?: string;
  activity: Activity[];
  session: SessionChange[];
  totalChanges: number;
}

export interface ModulePanel {
  kind: "module";
  eyebrow: string;
  name: string;
  badges: { editing?: boolean; failing?: number };
  explanation: Explanation;
  text: string;
  calledBy: Relation[];
  calls: Relation[];
  recent: RecentChange[];
}

export interface FunctionRow {
  id: string;
  name: string;
  status?: "editing" | "new";
}

export interface FilePanel {
  kind: "file";
  eyebrow: string;
  name: string;
  meta: string;
  explanation: Explanation;
  text: string;
  functions: FunctionRow[];
  calledBy: Named[];
  calls: Named[];
}

// Technical text with inline code, e.g. "Handles the `invoice.paid` event".
export type RichText = (string | { code: string })[];

export interface FunctionPanel {
  kind: "function";
  eyebrow: string;
  name: string;
  editingLine?: number;
  explanation: Explanation;
  text: RichText;
  signature: { keyword: string; lines: string[] };
  calledBy: Named[];
  calls: Named[];
  recent: RecentChange[];
}

// Code as a panel shows it: a function's lines, or a file's, from the line
// they start at.
export interface CodeView {
  path: string;
  startLine: number;
  lines: string[];
  // More of the file than is shown.
  cut: boolean;
}

export type ChangeMarker = "changed" | "editing" | "minor";

export interface ChangeItem {
  id: string;
  title: string;
  time: string;
  line?: string;
  marker: ChangeMarker;
  selected?: boolean;
}

export interface ChangesPanel {
  kind: "changes";
  since: string;
  minutes: number;
  structure: ChangeItem[];
  behavior: ChangeItem[];
  minor: number;
}

export type Panel = ProjectPanel | ModulePanel | FilePanel | FunctionPanel | ChangesPanel;

export type ChatBarKind = "editing" | "idle" | "offline";

export interface ChatBarView {
  kind: ChatBarKind;
  file?: string;
}

export interface AnswerStep {
  id: string;
  name: string;
  text: string;
}

export interface AskView {
  editingFile: string;
  question: string;
  intro: string;
  steps: AnswerStep[];
  explainStep: number;
  // The question is on its way: the answer is drawn as the thinking row.
  thinking?: boolean;
}

// Functions are code in the mono face at medium weight, modules are names in
// the interface face at semibold, files are code at regular weight.
export type PaletteRowKind = "function" | "module" | "file";

export interface PaletteRow {
  id: string;
  kind: PaletteRowKind;
  // Name split around the part that matches the query, which is underlined.
  before: string;
  match: string;
  after: string;
  location: string;
  editing?: boolean;
  active?: boolean;
  // Where opening the row leads, and the node to select there.
  opens?: PlaceRef;
  select?: string;
}

export interface PaletteView {
  query: string;
  functions: PaletteRow[];
  modulesAndFiles: PaletteRow[];
  ask: Named[];
}

export interface OnboardingView {
  step: number;
  total: number;
  // The node the card explains; the scrim is cut out around it.
  spotlight: Rect;
  card: { x: number; y: number };
}

export interface MapScreen {
  kind: "map";
  topbar: TopbarView;
  map: MapView;
  panel: Panel;
  chat: ChatBarView | AskView;
  overlay?:
    | { kind: "palette"; palette: PaletteView }
    | { kind: "onboarding"; onboarding: OnboardingView };
  offline?: { retryIn: number };
}

export type StepState = "done" | "running" | "pending";

export interface LoadingStep {
  id: string;
  label: string;
  result?: string;
  state: StepState;
}

// Outlines of where nodes will appear while the map is being built. Solid on
// the side that is already grouped, dashed on the side that is not.
export interface Ghost extends Rect {
  dashed: boolean;
}

export interface LoadingScreen {
  kind: "loading";
  topbar: TopbarView;
  project: string;
  ghosts: Ghost[];
  steps: LoadingStep[];
  progress: number;
}

export interface EmptyScreen {
  kind: "empty";
  topbar: TopbarView;
  folder: string;
}

export interface SettingsScreen {
  kind: "settings";
  topbar: TopbarView;
  choice: "system" | "dark" | "light";
  reduceMotion: boolean;
  agentActivity: boolean;
  changedMinutes: number;
  explanation: Explanation;
  port: number;
  ignored: string[];
}

export type Screen = MapScreen | LoadingScreen | EmptyScreen | SettingsScreen;
