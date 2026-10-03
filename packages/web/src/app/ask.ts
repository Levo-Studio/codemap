// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import type { ChatSummary, Explanation, MapScreen, Screen } from "../model/view";
import { en } from "../strings/en";
import { getJson, mapParams } from "./api";
import { type MapScreenState, mapKey } from "./map";

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
  const [asking, setAsking] = useState<
    { map: string; question: string; failed?: string } | undefined
  >();
  const [past, setPast] = useState<{ chats?: ChatSummary[] } | undefined>();
  // Answers to older questions or another map are dropped.
  const latest = useRef(0);
  const here = useRef("");
  here.current = map.openKey;

  const ask = (question: string) => {
    const at = map.openKey;
    const asked = ++latest.current;
    const current = () => asked === latest.current && here.current === at;
    setAsking({ map: at, question });
    // Hides past chats now; their removed field may not blur.
    setPast(undefined);
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
          map.setArrived(mapKey(at, id));
          setAsking(undefined);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!current()) return;
        setAsking({
          map: at,
          question,
          failed:
            body.error === "provider" ? en.chat.noProvider : en.chat.failed(body.message ?? ""),
        });
      })
      .catch(() => {
        if (current()) setAsking({ map: at, question, failed: en.chat.failed("") });
      });
  };

  const closeChat = () => {
    latest.current++;
    setChat(undefined);
    setAsking(undefined);
  };

  const reopen = (picked: ChatSummary) => {
    latest.current++;
    setPast(undefined);
    map.setOpen(picked.open);
    setSelect(undefined);
    setAsking(undefined);
    setChat({ id: picked.id, in: "map" });
  };

  const nodeSelected = (id: string | undefined) => {
    if (id && chat?.in === "map" && !asking) setChat({ ...chat, in: "panel" });
  };

  const answerBack = () => chat && setChat({ ...chat, in: "map" });

  const listChats = () => {
    // Focus returning from the list finds it already shown.
    if (past) return;
    setPast({});
    const unlisted = () => setPast(undefined);
    getJson<ChatSummary[]>("/api/chats")
      .then((chats) => {
        if (!chats) return unlisted();
        setPast((listing) => (listing ? { chats } : listing));
      })
      .catch(unlisted);
  };

  const hideChats = () => setPast(undefined);

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
