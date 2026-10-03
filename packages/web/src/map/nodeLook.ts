// SPDX-License-Identifier: Apache-2.0

import { node as m } from "../design/metrics";
import type { ColorToken } from "../design/tokens";
import type { MapNode, NodeKind, NodeState } from "../model/view";
import { en } from "../strings/en";

type Fill = ColorToken | "transparent";

interface NodeLook {
  background: Fill;
  border: { width: number; style: "solid" | "dashed"; color: ColorToken };
  radius: number;
  nameColor: ColorToken;
  status?: { text: string; color: ColorToken };
  pulse: boolean;
  outline: boolean;
  opacity: number;
}

const radiusOf = (kind: NodeKind) =>
  kind === "area" ? m.radius.area : kind === "file" ? m.radius.file : m.radius.other;

export function nodeLook(
  n: Pick<
    MapNode,
    "kind" | "state" | "statusText" | "selected" | "dimmed" | "minutesAgo" | "failingTests"
  >,
): NodeLook {
  const outlined = n.kind === "external";
  let background: Fill = outlined ? "transparent" : n.kind === "area" ? "container" : "card";
  let border: NodeLook["border"] = {
    width: m.border,
    style: "solid",
    color: n.kind === "area" ? "line3" : "line2",
  };
  let nameColor: ColorToken = outlined ? "text2" : "text1";
  let status: NodeLook["status"];
  const solid = (color: ColorToken, width: number = m.border) => ({
    width,
    style: "solid" as const,
    color,
  });

  const state: NodeState = n.state;
  switch (state) {
    case "hover":
      background = "hover";
      border = solid("line3");
      break;
    case "editing":
      background = "editBg";
      border = solid("edit", m.editingBorder);
      status = { text: en.status.editing, color: "edit" };
      break;
    case "reading":
      background = "readBg";
      border = { width: m.border, style: "dashed", color: "read" };
      status = { text: en.status.reading, color: "read" };
      break;
    case "changed":
      background = "neuBg";
      border = solid("neu");
      status = { text: en.status.changed, color: "neu" };
      break;
    case "faded":
      border = solid("neuFaded");
      status = { text: en.status.changedAgo(n.minutesAgo ?? 0), color: "text3" };
      break;
    case "new":
      background = "neuBg";
      border = solid("neu");
      status = { text: en.status.new, color: "neu" };
      break;
    case "error":
      border = solid("err");
      status = { text: en.status.testsFailing(n.failingTests ?? 0), color: "errText" };
      break;
    case "search":
      border = solid("text2");
      status = { text: en.status.match, color: "text1" };
      break;
    case "unexplored":
      background = "transparent";
      border = { width: m.border, style: "dashed", color: "line3" };
      nameColor = "text4";
      status = { text: en.status.notOpened, color: "text4" };
      break;
    case "default":
    case "selected":
    case "dimmed":
      break;
  }
  // A custom status line keeps the state's colour.
  if (n.statusText) status = { text: n.statusText, color: status?.color ?? "text4" };

  return {
    background,
    border,
    radius: radiusOf(n.kind),
    nameColor,
    ...(status ? { status } : {}),
    pulse: state === "editing",
    outline: state === "selected" || !!n.selected,
    opacity: state === "dimmed" || n.dimmed ? m.dimmedOpacity : 1,
  };
}
