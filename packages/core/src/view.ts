// SPDX-License-Identifier: Apache-2.0

export type Level = "system" | "area" | "file" | "function";

export type NodeKind = "area" | "module" | "file" | "function" | "external";

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
  meta: string;
  description?: string;
  state: NodeState;
  statusText?: string;
  error?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  step?: number;
  minutesAgo?: number;
  failingTests?: number;
  opens?: boolean;
  parent?: string;
}

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
  points: Point[];
  count?: number;
  strong?: boolean;
}

export interface ColumnLabel {
  id: string;
  label: string;
  x: number;
}

export interface Container extends Rect {
  title: string;
  meta: string;
  mono?: boolean;
}

export interface OpenedNode extends Container {
  id: string;
  kind: NodeKind;
  parent?: string;
  selected?: boolean;
}

export interface MapView {
  level: Level;
  columns: ColumnLabel[];
  container?: Container;
  opened?: OpenedNode[];
  nodes: MapNode[];
  edges: MapEdge[];
}

export type ConnectionStatus = "live" | "offline" | "indexing";

export interface TopbarView {
  project: string;
  crumbs: string[];
  trail?: (string | null)[];
  status: ConnectionStatus;
  changes: number;
  changesOpen: boolean;
}

export type Explanation = "simple" | "technical";

export interface Named {
  id: string;
  name: string;
}

export interface Relation {
  id: string;
  name: string;
  note?: string;
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

export interface CodeView {
  path: string;
  startLine: number;
  lines: string[];
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

export interface ChatSummary {
  id: string;
  at: number;
  question: string;
  open: string[];
}

export interface AskView {
  chat?: string;
  editingFile: string;
  question: string;
  intro: string;
  steps: AnswerStep[];
  explainStep: number;
  thinking?: boolean;
}

export type PaletteRowKind = "function" | "module" | "file";

export interface PaletteRow {
  id: string;
  kind: PaletteRowKind;
  before: string;
  match: string;
  after: string;
  location: string;
  editing?: boolean;
  active?: boolean;
  reveal?: string[];
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
