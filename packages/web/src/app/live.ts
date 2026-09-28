// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import { live } from "../design/metrics";

// The browser's line to the local server: /api/live tells it the project's
// version whenever it changes. When the line drops, the map shows the
// server as gone and the line is tried again after a countdown, or at once
// when asked to.

export interface Connection {
  // Whether the line to the server is down.
  offline: boolean;
  retryIn: number;
  // When the server was last heard from.
  lastSeen: number;
  retry(): void;
}

export function useLive(onVersion: (version: number) => void): Connection {
  const [offline, setOffline] = useState(false);
  const [retryIn, setRetryIn] = useState<number>(live.retrySeconds);
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  const socket = useRef<WebSocket | null>(null);
  const handler = useRef(onVersion);
  handler.current = onVersion;

  const connect = useCallback(() => {
    socket.current?.close();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const next = new WebSocket(`${protocol}//${window.location.host}/api/live`);
    socket.current = next;
    next.onmessage = (event) => {
      setLastSeen(Date.now());
      setOffline(false);
      const { version } = JSON.parse(String(event.data)) as { version: number };
      handler.current(version);
    };
    next.onclose = () => {
      if (socket.current !== next) return;
      setOffline(true);
      setRetryIn(live.retrySeconds);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      const current = socket.current;
      socket.current = null;
      current?.close();
    };
  }, [connect]);

  // While offline: one second at a time down to the next try.
  useEffect(() => {
    if (!offline) return;
    const tick = window.setInterval(
      () => setRetryIn((seconds) => Math.max(0, seconds - 1)),
      live.second,
    );
    return () => window.clearInterval(tick);
  }, [offline]);

  // At the end of the countdown: the next try, and a new countdown.
  useEffect(() => {
    if (!offline || retryIn > 0) return;
    setRetryIn(live.retrySeconds);
    connect();
  }, [offline, retryIn, connect]);

  const retry = useCallback(() => {
    setRetryIn(live.retrySeconds);
    connect();
  }, [connect]);

  // The try at zero starts a new count at once; the banner never says 0.
  return { offline, retryIn: Math.max(1, retryIn), lastSeen, retry };
}
