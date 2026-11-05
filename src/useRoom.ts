import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROOM_CLOSED_CODE,
  ROOM_FULL_CODE,
  type ActionKind,
  type ChatMessage,
  type ClientMessage,
  type Playback,
  type PrankTool,
  type ReactionKind,
  type RoomAccess,
  type Seats,
  type ServerMessage,
  type User,
} from "../shared/protocol.ts";
import { restoreUser } from "./api.ts";

const PING_INTERVAL_MS = 20_000;
const MAX_RECONNECT_MS = 10_000;

export type RoomConnection = "connecting" | "open" | "full" | "closed";

export type RoomEvents = {
  onAction: (userId: string, kind: ActionKind) => void;
  onReaction: (userId: string, kind: ReactionKind) => void;
  onPrank: (userId: string, tool: PrankTool, target: number) => void;
  /** A chat message sent after this person joined, so history never replays as bubbles. */
  onLiveChat: (message: ChatMessage) => void;
};

export function useRoom(roomId: number, onSignedOut: () => void, events: RoomEvents) {
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const [led, setLed] = useState("");
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [connection, setConnection] = useState<RoomConnection>("connecting");
  const [you, setYou] = useState<User | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [seats, setSeats] = useState<Seats>({});
  const [viewers, setViewers] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const clockOffset = useRef(0);
  const bestRtt = useRef(Infinity);

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setConnection("connecting");
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${location.host}/api/ws?room=${roomId}`);
      socketRef.current = socket;

      const ping = () => socket.send(JSON.stringify({ t: "ping", c: Date.now() } satisfies ClientMessage));

      socket.onopen = () => {
        attempts = 0;
        bestRtt.current = Infinity;
        setConnection("open");
        ping();
        setTimeout(() => socket.readyState === WebSocket.OPEN && ping(), 400);
        pingTimer = setInterval(ping, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.t) {
          case "welcome":
            clockOffset.current = message.now - Date.now();
            setYou(message.you);
            setPlayback(message.playback);
            setSeats(message.seats);
            setViewers(message.viewers);
            setMessages(message.messages);
            setLed(message.led);
            setAccess(message.access);
            break;
          case "access":
            setAccess(message.access);
            break;
          case "action":
            eventsRef.current.onAction(message.userId, message.kind);
            break;
          case "react":
            eventsRef.current.onReaction(message.userId, message.kind);
            break;
          case "prank":
            eventsRef.current.onPrank(message.userId, message.tool, message.target);
            break;
          case "led":
            setLed(message.text);
            break;
          case "playback":
            setPlayback(message.playback);
            break;
          case "seats":
            setSeats(message.seats);
            setViewers(message.viewers);
            break;
          case "chat":
            setMessages((current) => [...current, message.message].slice(-200));
            eventsRef.current.onLiveChat(message.message);
            break;
          case "pong": {
            // The lowest round trip gives the most trustworthy clock reading.
            const rtt = Date.now() - message.c;
            if (rtt < bestRtt.current) {
              bestRtt.current = rtt;
              clockOffset.current = message.now + rtt / 2 - Date.now();
            }
            break;
          }
          case "error":
            setNotice(message.message);
            break;
        }
      };

      socket.onclose = (event) => {
        clearInterval(pingTimer);
        if (stopped) return;
        if (event.code === ROOM_FULL_CODE) {
          setConnection("full");
          return;
        }
        if (event.code === ROOM_CLOSED_CODE) {
          setConnection("closed");
          return;
        }
        setConnection("connecting");
        restoreUser().then(
          (user) => {
            if (!user) onSignedOut();
          },
          () => {},
        );
        attempts += 1;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempts - 1), MAX_RECONNECT_MS));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [roomId, onSignedOut]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
    else setNotice("Đang mất kết nối với rạp. Hãy thử lại sau vài giây.");
  }, []);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  return { connection, you, playback, seats, viewers, messages, led, access, notice, send, serverNow };
}
