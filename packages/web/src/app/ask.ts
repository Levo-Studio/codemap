// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import type { ChatSummary, Explanation, MapScreen, Screen } from "../model/view";
import { en } from "../strings/en";
import { getJson, mapParams } from "./api";
import { type MapScreenState, mapKey } from "./map";

// The chat shown, and where: over the map, or in the panel once the user went
// on to the map. It is kept with the server, to open again later.
export type ShownChat = { id: string; in: "map" | "panel" };

interface AskContext {
  map: MapScreenState;
  select: string | undefined;
  setSelect: (id: string | undefined) => void;
  explanation: Explanation;
  chat: ShownChat | undefined;
  setChat: (chat: ShownChat | undefined) => void;
}

export function useAsk({ map, select, setSelect, explanation, chat, setChat }: AskContext) {
  // A question on its way, or what went wrong with it, and the map (by what
  // is open on it) whose answer is shown.
  const [asking, setAsking] = useState<
    { map: string; question: string; failed?: string } | undefined
  >();
  // The past chats, listed in the panel while the chat bar's field is taken;
  // without chats while they are on their way.
  const [past, setPast] = useState<{ chats?: ChatSummary[] } | undefined>();
  // The latest question, and the map shown now: an answer to an older
  // question, or one that arrives after the user closed it or opened or
  // closed a node, is dropped.
  const latest = useRef(0);
  const here = useRef("");
  here.current = map.openKey;

  const ask = (question: string) => {
    const at = map.openKey;
    const asked = ++latest.current;
    const current = () => asked === latest.current && here.current === at;
    setAsking({ map: at, question });
    // The field the question was typed in goes, and the past chats with it:
    // a field that goes while it has the focus is never left.
    setPast(undefined);
    // A question asked from the panel is answered over the map again.
    if (chat?.in === "panel") setChat({ ...chat, in: "map" });
    fetch(`/api/ask?${mapParams(map.open, false, select, explanation)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then(async (response) => {
        if (!current()) return;
        if (response.ok) {
          const next = (await response.json()) as Screen;
          map.setScreen(next);
          const id = next.kind === "map" && !("kind" in next.chat) ? next.chat.chat : undefined;
          setChat(id ? { id, in: "map" } : undefined);
          // The answer came with its map: nothing more is on its way.
          map.setArrived(mapKey(at, id));
          setAsking(undefined);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!current()) return;
        setAsking({
          map: at,
          question,
          failed: response.status === 409 ? en.chat.noProvider : en.chat.failed(body.message ?? ""),
        });
      })
      .catch(() => {
        if (current()) setAsking({ map: at, question, failed: en.chat.failed("") });
      });
  };

  // Closed, a chat stays with the server among the past ones.
  const closeChat = () => {
    latest.current++;
    setChat(undefined);
    setAsking(undefined);
  };

  // A past chat opens as it was asked: the nodes open then, its answer over
  // the map, its steps numbered on it. A question still on its way is
  // dropped, as when a chat is closed: its answer would replace this one.
  const reopen = (picked: ChatSummary) => {
    latest.current++;
    setPast(undefined);
    map.setOpen(picked.open);
    setSelect(undefined);
    setAsking(undefined);
    setChat({ id: picked.id, in: "map" });
  };

  // Going on to a node the answer shows moves the answer into the panel; a
  // question still on its way stays over the map, where its answer will be.
  const nodeSelected = (id: string | undefined) => {
    if (id && chat?.in === "map" && !asking) setChat({ ...chat, in: "panel" });
  };

  const answerBack = () => chat && setChat({ ...chat, in: "map" });

  const listChats = () => {
    // Back from the list with Escape, the list is kept as it is.
    if (past) return;
    setPast({});
    // A list that cannot be read is not shown, rather than shown empty.
    const unlisted = () => setPast(undefined);
    getJson<ChatSummary[]>("/api/chats")
      .then((chats) => {
        if (!chats) return unlisted();
        setPast((listing) => (listing ? { chats } : listing));
      })
      .catch(unlisted);
  };

  const hideChats = () => setPast(undefined);

  // While a question is on its way, or when it failed, the answer panel says
  // so in place of an answer.
  const over = (screen: MapScreen): MapScreen => {
    const waiting = asking?.map === map.openKey ? asking : undefined;
    if (!waiting) return screen;
    return {
      ...screen,
      chat: {
        editingFile:
          "kind" in screen.chat && screen.chat.kind === "editing" ? (screen.chat.file ?? "") : "",
        question: waiting.question,
        intro: waiting.failed ?? "",
        steps: [],
        explainStep: 0,
        ...(waiting.failed ? {} : { thinking: true }),
      },
    };
  };

  return {
    ask,
    closeChat,
    reopen,
    nodeSelected,
    answerBack,
    listChats,
    hideChats,
    over,
    pastChats: past ? { ...past, onPick: reopen } : undefined,
  };
}
