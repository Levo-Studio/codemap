// SPDX-License-Identifier: Apache-2.0

import type { Theme } from "../design/tokens";
import type {
  EdgeKind,
  MapEdge,
  MapNode,
  MapScreen,
  NodeKind,
  NodeState,
  Point,
  Screen,
  TopbarView,
} from "../model/view";
import { en } from "../strings/en";

// ledgerly-web, the demo project of the design export: an invoicing app on
// Next.js. Positions, states and texts are transcribed from the screen files
// in design/ (Map System, Map Area, Map File, Map Function, App States), in
// the map's own coordinates: the map starts below the 56 px topbar and is
// 1060 × 844. This is the fixture for the static interface and the visual
// tests, not a description of how real code is grouped.

export type SystemMode = "default" | "ask" | "changes" | "palette" | "onboarding" | "offline";
export type AppStateMode = "loading" | "empty" | "settings";

const PROJECT = "ledgerly-web";
const EDITING_FILE = "billing/webhook.ts";
const { separator: dot, path: arrow } = en.meta;

const route = (...points: [number, number][]): Point[] => points.map(([x, y]) => ({ x, y }));

function topbar(crumbs: string[], overrides: Partial<TopbarView> = {}): TopbarView {
  return { project: PROJECT, crumbs, status: "live", changes: 5, changesOpen: false, ...overrides };
}

interface NodeSpec {
  id: string;
  kind: NodeKind;
  label: string;
  meta: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state?: NodeState;
  statusText?: string;
  description?: string;
  error?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  failingTests?: number;
}

function node(spec: NodeSpec): MapNode {
  return { state: "default", ...spec };
}

interface EdgeSpec {
  from: string;
  to: string;
  points: Point[];
  // What the edge is in the design's default mode.
  kind?: EdgeKind;
  // Part of the answer to the Ask question on the system map.
  answer?: boolean;
}

function edges(specs: EdgeSpec[], resolve: (spec: EdgeSpec) => Pick<MapEdge, "kind" | "strong">) {
  return specs.map((spec, index): MapEdge => {
    const { kind, strong } = resolve(spec);
    return {
      id: `${spec.from}-${spec.to}-${index}`,
      from: spec.from,
      to: spec.to,
      points: spec.points,
      kind,
      ...(strong ? { strong } : {}),
    };
  });
}

const drawn = (spec: EdgeSpec) => {
  const kind = spec.kind ?? "call";
  return { kind, strong: kind === "active" };
};

// ---------------------------------------------------------------- System

const systemNodes: NodeSpec[] = [
  {
    id: "frontend",
    kind: "area",
    label: "Frontend",
    meta: en.meta.files(142),
    x: 60,
    y: 200,
    width: 180,
    height: 72,
  },
  {
    id: "dashboard",
    kind: "area",
    label: "Dashboard",
    meta: en.meta.files(38),
    x: 60,
    y: 380,
    width: 180,
    height: 72,
  },
  {
    id: "api",
    kind: "area",
    label: "API",
    meta: en.meta.routes(41),
    x: 300,
    y: 290,
    width: 180,
    height: 72,
  },
  {
    id: "billing",
    kind: "area",
    label: "Billing",
    meta: en.meta.files(27),
    x: 540,
    y: 160,
    width: 180,
    height: 72,
    state: "editing",
    statusText: en.status.agentEditing,
  },
  {
    id: "jobs",
    kind: "area",
    label: "Jobs",
    meta: en.meta.files(12),
    x: 540,
    y: 340,
    width: 180,
    height: 72,
    state: "changed",
    statusText: en.status.added("Dunning"),
  },
  {
    id: "auth",
    kind: "area",
    label: "Auth",
    meta: en.meta.files(19),
    x: 540,
    y: 520,
    width: 180,
    height: 72,
  },
  {
    id: "database",
    kind: "area",
    label: "Database",
    meta: en.meta.files(24),
    x: 800,
    y: 160,
    width: 180,
    height: 72,
    state: "reading",
  },
  {
    id: "email",
    kind: "area",
    label: "Email",
    meta: en.meta.files(16),
    x: 800,
    y: 340,
    width: 180,
    height: 72,
  },
  {
    id: "stripe",
    kind: "external",
    label: "Stripe",
    meta: en.meta.external,
    x: 560,
    y: 60,
    width: 140,
    height: 44,
  },
  {
    id: "neon",
    kind: "external",
    label: "Neon Postgres",
    meta: en.meta.external,
    x: 820,
    y: 70,
    width: 140,
    height: 44,
  },
  {
    id: "resend",
    kind: "external",
    label: "Resend",
    meta: en.meta.external,
    x: 820,
    y: 450,
    width: 140,
    height: 44,
  },
  {
    id: "google",
    kind: "external",
    label: "Google OAuth",
    meta: en.meta.external,
    x: 800,
    y: 520,
    width: 160,
    height: 44,
  },
];

const systemEdges: EdgeSpec[] = [
  { from: "frontend", to: "api", points: route([240, 236], [270, 236], [270, 310], [300, 310]) },
  {
    from: "dashboard",
    to: "api",
    points: route([240, 416], [270, 416], [270, 342], [300, 342]),
    answer: true,
  },
  {
    from: "api",
    to: "billing",
    points: route([480, 310], [510, 310], [510, 196], [540, 196]),
    answer: true,
  },
  { from: "api", to: "auth", points: route([480, 342], [510, 342], [510, 556], [540, 556]) },
  { from: "stripe", to: "billing", points: route([660, 104], [660, 160]), answer: true },
  { from: "billing", to: "stripe", points: route([600, 160], [600, 104]), answer: true },
  { from: "billing", to: "jobs", points: route([630, 232], [630, 340]), kind: "new" },
  { from: "billing", to: "database", points: route([720, 196], [800, 196]), kind: "active" },
  { from: "jobs", to: "database", points: route([720, 356], [760, 356], [760, 216], [800, 216]) },
  { from: "jobs", to: "email", points: route([720, 390], [800, 390]) },
  { from: "database", to: "neon", points: route([890, 160], [890, 114]) },
  { from: "email", to: "resend", points: route([890, 412], [890, 450]) },
  { from: "auth", to: "google", points: route([720, 542], [800, 542]) },
];

const answerSteps: Record<string, number> = { dashboard: 1, api: 2, stripe: 3, billing: 4 };

function systemScreen(mode: SystemMode, theme: Theme): MapScreen {
  const ask = mode === "ask";
  const offline = mode === "offline";

  const nodes = systemNodes.map((spec): MapNode => {
    const { statusText, state, ...rest } = spec;
    const step = answerSteps[spec.id];
    const shown = node({
      ...rest,
      ...(offline ? {} : { ...(state ? { state } : {}), ...(statusText ? { statusText } : {}) }),
      ...(ask && step === undefined ? { dimmed: true } : {}),
      ...(mode === "changes" && spec.id === "jobs" ? { selected: true } : {}),
    });
    return ask && step !== undefined ? { ...shown, step } : shown;
  });

  const resolved = edges(systemEdges, (spec) => {
    const kind = spec.kind ?? "call";
    if (offline) return { kind: "call" };
    if (ask)
      return spec.answer
        ? { kind: "path", strong: true }
        : { kind: "dimmed", strong: kind === "active" };
    return { kind, strong: kind === "active" };
  });

  const screen: MapScreen = {
    kind: "map",
    theme,
    topbar: topbar([en.topbar.crumbs.system], {
      status: offline ? "offline" : "live",
      changesOpen: mode === "changes",
    }),
    map: {
      level: "system",
      columns: [
        { label: en.columns.entry, x: 60 },
        { label: en.columns.api, x: 300 },
        { label: en.columns.features, x: 540 },
        { label: en.columns.dataAndServices, x: 800 },
      ],
      nodes,
      edges: resolved,
    },
    panel:
      mode === "changes"
        ? {
            kind: "changes",
            since: "14:02",
            minutes: 38,
            structure: [
              {
                title: "New module Dunning",
                time: "14:21",
                line: "Retries failed payments. 3 files, calls Jobs.",
                marker: "changed",
                selected: true,
              },
              {
                title: "New table billing_events",
                time: "14:29",
                line: "Stores every Stripe event once.",
                marker: "changed",
              },
            ],
            behavior: [
              {
                title: "Payments handled once",
                time: en.panel.now,
                line: "handleInvoicePaid skips events it has seen. In progress.",
                marker: "editing",
              },
              {
                title: "Payment-failed email",
                time: "14:24",
                line: "Sent when a retry fails.",
                marker: "changed",
              },
            ],
            minor: 3,
          }
        : {
            kind: "project",
            name: PROJECT,
            meta: ["Next.js", en.meta.areas(8), en.meta.files(1284)].join(dot),
            explanation: "simple",
            text: "An invoicing app for small businesses. Customers sign in, manage invoices in the dashboard and pay for a plan through Stripe. Everything is stored in Postgres.",
            ...(offline ? { activityTime: "14:40" } : {}),
            activity: [
              { kind: "editing", where: ["Billing", "Webhooks"].join(arrow) },
              { kind: "reading", where: ["Database", "subscriptions"].join(arrow) },
            ],
            session: [
              { title: "New module Dunning", time: "14:21" },
              { title: "New table billing_events", time: "14:29" },
            ],
            totalChanges: 5,
          },
    chat: ask
      ? {
          editingFile: EDITING_FILE,
          question: "How does a customer get charged?",
          intro: "In four steps. They are numbered on the map.",
          steps: [
            { name: "Dashboard", text: "the customer picks a plan and presses Upgrade." },
            { name: "API", text: "creates a checkout session with Stripe." },
            { name: "Stripe", text: "takes the payment and reports it back." },
            { name: "Billing", text: "activates the plan and saves the invoice." },
          ],
          explainStep: 4,
        }
      : offline
        ? { kind: "offline" }
        : { kind: "editing", file: EDITING_FILE },
  };

  if (offline) screen.offline = { retryIn: 4 };
  if (mode === "palette") {
    screen.overlay = {
      kind: "palette",
      palette: {
        query: "invoice",
        functions: [
          {
            kind: "function",
            before: "handle",
            match: "Invoice",
            after: "Paid",
            location: ["Billing", "webhook.ts"].join(arrow),
            editing: true,
            active: true,
          },
          {
            kind: "function",
            before: "handle",
            match: "Invoice",
            after: "PaymentFailed",
            location: ["Billing", "webhook.ts"].join(arrow),
          },
        ],
        // The module row is drawn without an underline; the HTML wins.
        modulesAndFiles: [
          {
            kind: "module",
            before: "Invoices",
            match: "",
            after: "",
            location: ["Billing", en.meta.files(2)].join(dot),
          },
          {
            kind: "file",
            before: "sync-",
            match: "invoice",
            after: ".ts",
            location: ["Billing", "Invoices"].join(arrow),
          },
        ],
        ask: ["Explain how invoices work"],
      },
    };
  }
  if (mode === "onboarding") {
    screen.overlay = {
      kind: "onboarding",
      onboarding: {
        step: 1,
        total: 3,
        spotlight: { x: 532, y: 208, width: 196, height: 88 },
        card: { x: 760, y: 196 },
      },
    };
  }
  return screen;
}

// ---------------------------------------------------------------- Area: Billing

function areaScreen(theme: Theme): MapScreen {
  const outlined = (
    id: string,
    label: string,
    meta: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => node({ id, kind: "external", label, meta, x, y, width, height });
  const mod = (
    id: string,
    label: string,
    files: number,
    x: number,
    y: number,
    extra: Partial<NodeSpec> = {},
  ) =>
    node({
      id,
      kind: "module",
      label,
      meta: en.meta.files(files),
      x,
      y,
      width: 140,
      height: 64,
      ...extra,
    });

  return {
    kind: "map",
    theme,
    topbar: topbar([en.topbar.crumbs.system, "Billing"]),
    map: {
      level: "area",
      columns: [
        { label: en.columns.callsInto("Billing"), x: 40 },
        { label: en.columns.calls("Billing"), x: 840 },
      ],
      container: {
        x: 450,
        y: 150,
        width: 340,
        height: 302,
        title: "Billing",
        meta: [en.meta.modules(6), en.meta.files(27)].join(dot),
      },
      nodes: [
        outlined("stripe", "Stripe", en.meta.external, 560, 60, 120, 52),
        outlined("frontend", "Frontend", en.meta.files(142), 40, 230, 160, 52),
        outlined("dashboard", "Dashboard", en.meta.files(38), 40, 310, 160, 52),
        { ...outlined("auth", "Auth", en.meta.files(19), 40, 470, 160, 52), dimmed: true },
        outlined("api", "API", en.meta.routes(41), 240, 280, 160, 72),
        mod("subscriptions", "Subscriptions", 3, 470, 200, { state: "reading" }),
        mod("webhooks", "Webhooks", 4, 630, 200, { state: "editing", error: true, selected: true }),
        mod("invoices", "Invoices", 2, 470, 284),
        mod("plans", "Plans", 2, 630, 284),
        mod("portal", "Portal", 1, 470, 368),
        mod("dunning", "Dunning", 3, 630, 368, { state: "new" }),
        node({
          id: "database",
          kind: "area",
          label: "Database",
          meta: ["Postgres", "Drizzle"].join(dot),
          x: 840,
          y: 200,
          width: 180,
          height: 64,
        }),
        node({
          id: "jobs",
          kind: "area",
          label: "Jobs",
          meta: "Background tasks",
          x: 840,
          y: 300,
          width: 180,
          height: 64,
        }),
      ],
      edges: edges(
        [
          {
            from: "frontend",
            to: "api",
            points: route([200, 256], [220, 256], [220, 300], [240, 300]),
          },
          { from: "dashboard", to: "api", points: route([200, 336], [240, 336]) },
          {
            from: "api",
            to: "auth",
            points: route([320, 352], [320, 496], [200, 496]),
            kind: "dimmed",
          },
          {
            from: "api",
            to: "subscriptions",
            points: route([400, 300], [435, 300], [435, 232], [470, 232]),
          },
          {
            from: "api",
            to: "portal",
            points: route([400, 330], [435, 330], [435, 400], [470, 400]),
          },
          {
            from: "subscriptions",
            to: "stripe",
            points: route([540, 200], [540, 136], [590, 136], [590, 112]),
          },
          {
            from: "stripe",
            to: "webhooks",
            points: route([650, 112], [650, 136], [700, 136], [700, 200]),
          },
          { from: "webhooks", to: "subscriptions", points: route([630, 232], [610, 232]) },
          {
            from: "webhooks",
            to: "database",
            points: route([770, 228], [840, 228]),
            kind: "active",
          },
          {
            from: "webhooks",
            to: "jobs",
            points: route([770, 250], [805, 250], [805, 320], [840, 320]),
          },
          {
            from: "dunning",
            to: "jobs",
            points: route([770, 400], [820, 400], [820, 348], [840, 348]),
            kind: "new",
          },
        ],
        drawn,
      ),
    },
    panel: {
      kind: "module",
      eyebrow: ["Billing", en.panel.kind.module].join(dot),
      name: "Webhooks",
      badges: { editing: true, failing: 1 },
      explanation: "simple",
      text: "Stripe sends a message for every payment, renewal or cancellation. Webhooks checks it is genuine, then updates the subscription and stores the invoice.",
      calledBy: [{ name: "Stripe", note: "sends events" }],
      calls: [
        { name: "Database", note: "writing now", live: true },
        { name: "Subscriptions", note: "updates status" },
        { name: "Jobs", note: "queues the receipt" },
      ],
      recent: [
        { title: "Skip events that were already handled", time: en.panel.now },
        { title: "Record every event in billing_events", time: "14:29" },
      ],
    },
    chat: { kind: "editing", file: EDITING_FILE },
  };
}

// ---------------------------------------------------------------- File: Webhooks

function fileScreen(theme: Theme): MapScreen {
  const file = (
    id: string,
    label: string,
    meta: string,
    x: number,
    y: number,
    extra: Partial<NodeSpec> = {},
  ) => node({ id, kind: "file", label, meta, x, y, width: 150, height: 48, ...extra });
  const mod = (id: string, label: string, meta: string, y: number, extra: Partial<NodeSpec> = {}) =>
    node({ id, kind: "module", label, meta, x: 820, y, width: 180, height: 48, ...extra });

  return {
    kind: "map",
    theme,
    topbar: topbar([en.topbar.crumbs.system, "Billing", "Webhooks"]),
    map: {
      level: "file",
      columns: [
        { label: en.columns.callsInto("Webhooks"), x: 100 },
        { label: en.columns.calls("Webhooks"), x: 820 },
      ],
      container: {
        x: 360,
        y: 170,
        width: 360,
        height: 200,
        title: "Webhooks",
        meta: ["Billing", en.meta.files(4)].join(dot),
      },
      nodes: [
        node({
          id: "stripe",
          kind: "external",
          label: "Stripe",
          meta: en.meta.external,
          x: 100,
          y: 220,
          width: 160,
          height: 48,
        }),
        file("route", "route.ts", en.meta.lines(32), 380, 220),
        file("verify", "verify.ts", en.meta.lines(41), 550, 220),
        file("test", "webhook.test.ts", "", 380, 300, { state: "error", failingTests: 1 }),
        file("webhook", "webhook.ts", en.meta.lines(214), 550, 300, {
          state: "editing",
          selected: true,
        }),
        mod("subscriptions", "Subscriptions", "Billing", 220, { state: "reading" }),
        mod("database", "Database", "Postgres", 300),
        mod("jobs", "Jobs", "Background tasks", 380),
      ],
      edges: edges(
        [
          { from: "stripe", to: "route", points: route([260, 244], [380, 244]) },
          { from: "route", to: "verify", points: route([530, 244], [550, 244]) },
          {
            from: "route",
            to: "webhook",
            points: route([455, 268], [455, 282], [625, 282], [625, 300]),
          },
          { from: "test", to: "webhook", points: route([530, 324], [550, 324]) },
          {
            from: "webhook",
            to: "database",
            points: route([700, 324], [820, 324]),
            kind: "active",
          },
          {
            from: "webhook",
            to: "subscriptions",
            points: route([700, 310], [760, 310], [760, 244], [820, 244]),
          },
          {
            from: "webhook",
            to: "jobs",
            points: route([700, 338], [760, 338], [760, 404], [820, 404]),
          },
        ],
        drawn,
      ),
    },
    panel: {
      kind: "file",
      eyebrow: [["Billing", "Webhooks"].join(arrow), en.panel.kind.file].join(dot),
      name: "webhook.ts",
      meta: [en.meta.lines(214), en.meta.functions(7)].join(dot),
      explanation: "simple",
      text: "Decides what to do with each message from Stripe: a payment, a failed payment, a plan change or a cancellation.",
      functions: [
        { name: "verifyStripeSignature" },
        { name: "routeStripeEvent" },
        { name: "handleInvoicePaid", status: "editing" },
        { name: "handleInvoicePaymentFailed" },
        { name: "handleSubscriptionUpdated" },
        { name: "handleSubscriptionDeleted" },
        { name: "recordBillingEvent", status: "new" },
      ],
      calledBy: ["route.ts", "webhook.test.ts"],
      calls: ["Subscriptions", "Database", "Jobs"],
    },
    chat: { kind: "editing", file: EDITING_FILE },
  };
}

// ---------------------------------------------------------------- Function: webhook.ts

function functionScreen(theme: Theme): MapScreen {
  const fn = (
    id: string,
    label: string,
    description: string,
    x: number,
    y: number,
    width = 240,
    extra: Partial<NodeSpec> = {},
  ) =>
    node({ id, kind: "function", label, meta: "", description, x, y, width, height: 96, ...extra });

  return {
    kind: "map",
    theme,
    topbar: topbar([en.topbar.crumbs.system, "Billing", "Webhooks", "webhook.ts"]),
    map: {
      level: "function",
      columns: [],
      container: {
        x: 260,
        y: 150,
        width: 540,
        height: 398,
        title: "webhook.ts",
        meta: [en.meta.lines(214), en.meta.functions(7)].join(dot),
        mono: true,
      },
      nodes: [
        fn("post", "POST", "Receives the request from Stripe", 40, 196, 200),
        fn(
          "verify",
          "verifyStripeSignature",
          "Checks the message really came from Stripe",
          280,
          196,
        ),
        fn("route", "routeStripeEvent", "Sends each event type to its handler", 540, 196),
        fn(
          "failed",
          "handleInvoicePaymentFailed",
          "Marks the account past due and starts retries",
          280,
          312,
        ),
        fn(
          "paid",
          "handleInvoicePaid",
          "Activates the plan after a successful payment",
          540,
          312,
          240,
          {
            state: "editing",
            selected: true,
          },
        ),
        fn("updated", "handleSubscriptionUpdated", "Copies plan changes from Stripe", 280, 428),
        fn(
          "record",
          "recordBillingEvent",
          "Saves each event once, so repeats are ignored",
          540,
          428,
          240,
          {
            state: "new",
          },
        ),
        fn(
          "subscriptions",
          "subscriptions",
          "Current plan and status per customer",
          840,
          312,
          180,
          {
            state: "reading",
          },
        ),
        fn("events", "billing_events", "Log of every Stripe event", 840, 428, 180, {
          state: "new",
        }),
      ],
      edges: edges(
        [
          { from: "post", to: "verify", points: route([240, 244], [280, 244]) },
          { from: "verify", to: "route", points: route([520, 244], [540, 244]) },
          { from: "route", to: "paid", points: route([660, 292], [660, 312]) },
          {
            from: "route",
            to: "failed",
            points: route([600, 292], [600, 302], [400, 302], [400, 312]),
          },
          {
            from: "paid",
            to: "subscriptions",
            points: route([780, 360], [840, 360]),
            kind: "active",
          },
          { from: "paid", to: "record", points: route([660, 408], [660, 428]), kind: "new" },
          { from: "record", to: "events", points: route([780, 476], [840, 476]), kind: "new" },
        ],
        drawn,
      ),
    },
    panel: {
      kind: "function",
      eyebrow: ["webhook.ts", en.panel.kind.function].join(dot),
      name: "handleInvoicePaid",
      editingLine: 61,
      explanation: "technical",
      text: [
        "Handles the ",
        { code: "invoice.paid" },
        " event. Upserts the invoice, sets the subscription to active, extends the billing period and queues a receipt. Being changed to return early if the event id already exists in ",
        { code: "billing_events" },
        ".",
      ],
      signature: {
        keyword: "async function",
        lines: [" handleInvoicePaid(", "  event: Stripe.InvoicePaidEvent", "): Promise<void>"],
      },
      calledBy: ["routeStripeEvent"],
      calls: ["db.subscriptions", "recordBillingEvent", "enqueueReceipt"],
      recent: [
        { title: "Skip already handled events", time: en.panel.now, added: 18, removed: 4 },
        { title: "Call recordBillingEvent", time: "14:29", added: 2 },
      ],
    },
    chat: { kind: "editing", file: EDITING_FILE },
  };
}

// ---------------------------------------------------------------- App states

function appStateScreen(mode: AppStateMode, theme: Theme): Screen {
  if (mode === "loading") {
    return {
      kind: "loading",
      theme,
      topbar: topbar([en.topbar.crumbs.indexing], { status: "indexing", changes: 0 }),
      project: PROJECT,
      ghosts: [
        { x: 60, y: 200, width: 180, height: 72, dashed: false },
        { x: 60, y: 380, width: 180, height: 72, dashed: false },
        { x: 300, y: 290, width: 180, height: 72, dashed: false },
        { x: 1020, y: 160, width: 180, height: 72, dashed: true },
        { x: 1020, y: 340, width: 180, height: 72, dashed: true },
        { x: 1260, y: 250, width: 140, height: 72, dashed: true },
      ],
      steps: [
        { label: en.loading.steps.scan, result: en.meta.files(1284), state: "done" },
        { label: en.loading.steps.parse, result: "TypeScript, TSX", state: "done" },
        { label: en.loading.steps.resolve, result: en.meta.links(3912), state: "done" },
        { label: en.loading.steps.group, result: en.loading.ofTotal(3, 8), state: "running" },
        { label: en.loading.steps.explain, state: "pending" },
      ],
      progress: 62,
    };
  }
  if (mode === "empty") {
    return {
      kind: "empty",
      theme,
      topbar: topbar([en.topbar.crumbs.noProject], { project: "Downloads", changes: 0 }),
      folder: "~/Downloads",
    };
  }
  return {
    kind: "settings",
    theme,
    topbar: topbar([en.topbar.crumbs.settings]),
    choice: theme,
    reduceMotion: false,
    agentActivity: true,
    changedMinutes: 30,
    explanation: "simple",
    port: 4317,
    ignored: ["node_modules", ".next", "dist"],
  };
}

export type FixtureName = "map-system" | "map-area" | "map-file" | "map-function" | "app-states";

export const fixtureModes: Record<FixtureName, readonly string[]> = {
  "map-system": ["default", "ask", "changes", "palette", "onboarding", "offline"],
  "map-area": ["default"],
  "map-file": ["default"],
  "map-function": ["default"],
  "app-states": ["loading", "empty", "settings"],
};

export function fixtureScreen(name: FixtureName, mode: string, theme: Theme): Screen {
  switch (name) {
    case "map-system":
      return systemScreen(mode as SystemMode, theme);
    case "map-area":
      return areaScreen(theme);
    case "map-file":
      return fileScreen(theme);
    case "map-function":
      return functionScreen(theme);
    case "app-states":
      return appStateScreen(mode as AppStateMode, theme);
  }
}
