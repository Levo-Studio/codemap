// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import { live } from "../design/metrics";

export interface Connection {
  offline: boolean;
  retryIn: number;
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

  useEffect(() => {
    if (!offline) return;
    const tick = window.setInterval(
      () => setRetryIn((seconds) => Math.max(0, seconds - 1)),
      live.second,
    );
    return () => window.clearInterval(tick);
  }, [offline]);

  useEffect(() => {
    if (!offline || retryIn > 0) return;
    setRetryIn(live.retrySeconds);
    connect();
  }, [offline, retryIn, connect]);

  const retry = useCallback(() => {
    setRetryIn(live.retrySeconds);
    connect();
  }, [connect]);

  // Never show 0: the try at zero restarts the countdown.
  return { offline, retryIn: Math.max(1, retryIn), lastSeen, retry };
}

export function useFreshness(): { freshness: number; connection: Connection } {
  const [freshness, setFreshness] = useState(0);
  const connection = useLive(() => setFreshness((n) => n + 1));
  useEffect(() => {
    const refresh = window.setInterval(
      () => setFreshness((n) => n + 1),
      live.refreshSeconds * live.second,
    );
    return () => window.clearInterval(refresh);
  }, []);
  return { freshness, connection };
}
