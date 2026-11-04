import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { seatLabel, type ActionKind, type ChatMessage, type ReactionKind, type Seats } from "../shared/protocol.ts";
import { ReactionIcon } from "./ReactionIcon.tsx";
import type { TheaterScene } from "./theater/scene.ts";

const BUBBLE_MS = 6000;
const BUBBLE_MAX_LENGTH = 80;
const REACTION_MS = 1800;
const MAX_FLOATERS = 40;

export type TheaterHandle = {
  playAction: (userId: string, kind: ActionKind) => void;
  showBubble: (message: ChatMessage) => void;
  showReaction: (userId: string, kind: ReactionKind) => void;
};

type Bubble = { id: string; userId: string; name: string; text: string };
type Floater = { id: number; kind: ReactionKind; x: number; y: number };

type Props = {
  seats: Seats;
  youId: string | null;
  lightsOn: boolean;
  topRef: RefObject<HTMLElement | null>;
  bottomRef: RefObject<HTMLElement | null>;
  onPick: (seat: number) => void;
};

export const Theater = forwardRef<TheaterHandle, Props>(function Theater({ seats, youId, lightsOn, topRef, bottomRef, onPick }, handle) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TheaterScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextFloater = useRef(0);
  const bubbleNodes = useRef(new Map<string, HTMLDivElement>());
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const hoverNode = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const youIdRef = useRef(youId);
  youIdRef.current = youId;
  const lightsRef = useRef(lightsOn);
  lightsRef.current = lightsOn;

  // The scene moves every frame, so labels are positioned directly rather than through React state.
  const placeLabels = useCallback(() => {
    const current = scene.current;
    if (!current) return;
    for (const bubble of bubblesRef.current) {
      const node = bubbleNodes.current.get(bubble.id);
      const at = current.headOnScreen(bubble.userId);
      if (!node) continue;
      node.hidden = !at;
      if (at) node.style.transform = `translate(calc(${at.x}px - 50%), calc(${at.y}px - 100%))`;
    }
    if (hoverNode.current && hoveredRef.current) {
      const at = current.seatOnScreen(hoveredRef.current);
      hoverNode.current.style.transform = `translate(calc(${at.x}px - 50%), calc(${at.y}px - 100%))`;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const fit = () => {
      if (!scene.current) return;
      const top = topRef.current?.getBoundingClientRect().bottom ?? 0;
      const bottom = bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight;
      const stage = topRef.current?.getBoundingClientRect();
      scene.current.layout(window.innerWidth, window.innerHeight, top + 6, bottom - 6, stage?.right ?? window.innerWidth, stage?.top ?? 0);
    };

    import("./theater/scene.ts").then(({ TheaterScene }) => {
      if (cancelled || !canvas.current) return;
      try {
        scene.current = new TheaterScene(canvas.current, {
          onSeatClick: (seat) => onPickRef.current(seat),
          onHover: setHovered,
          onFrame: placeLabels,
        });
      } catch {
        // No WebGL on this device: the seat list and chat still work without the hall.
        setFailed(true);
        return;
      }
      scene.current.setSeats(seatsRef.current, youIdRef.current);
      scene.current.setLightsOn(lightsRef.current);
      fit();
      observer = new ResizeObserver(fit);
      if (topRef.current) observer.observe(topRef.current);
      if (bottomRef.current) observer.observe(bottomRef.current);
      window.addEventListener("resize", fit);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [topRef, bottomRef, placeLabels]);

  useEffect(() => {
    scene.current?.setSeats(seats, youId);
  }, [seats, youId]);

  useEffect(() => {
    scene.current?.setLightsOn(lightsOn);
  }, [lightsOn]);

  useImperativeHandle(
    handle,
    () => ({
      playAction: (userId, kind) => scene.current?.playAction(userId, kind),
      showBubble: (message) => {
        const text = message.text.length > BUBBLE_MAX_LENGTH ? `${message.text.slice(0, BUBBLE_MAX_LENGTH)}…` : message.text;
        const bubble: Bubble = { id: message.id, userId: message.userId, name: message.name, text };
        // One bubble per person: a new message replaces their last one.
        setBubbles((current) => [...current.filter((item) => item.userId !== message.userId), bubble]);
        setTimeout(() => setBubbles((current) => current.filter((item) => item.id !== message.id)), BUBBLE_MS);
      },
      showReaction: (userId, kind) => {
        const at = scene.current?.headOnScreen(userId);
        if (!at) return;
        const id = (nextFloater.current += 1);
        setFloaters((current) => [...current.slice(-(MAX_FLOATERS - 1)), { id, kind, x: at.x, y: at.y }]);
        setTimeout(() => setFloaters((current) => current.filter((item) => item.id !== id)), REACTION_MS);
      },
    }),
    [],
  );

  const hoveredPerson = hovered ? seats[hovered] : null;

  return (
    <div className="theater">
      <canvas ref={canvas} className="theater-canvas" aria-hidden="true" />
      {failed && <p className="theater-fallback">Thiết bị này không hiển thị được khán phòng 3D. Bạn vẫn xem video, chọn ghế và trò chuyện được.</p>}
      <div className="theater-labels">
        {floaters.map((floater) => (
          <div key={floater.id} className="floater" style={{ left: floater.x, top: floater.y }}>
            <ReactionIcon kind={floater.kind} />
          </div>
        ))}
        {bubbles.map((bubble) => (
          <div
            key={bubble.id}
            className={`bubble${bubble.userId === youId ? " is-you" : ""}`}
            ref={(node) => {
              if (node) bubbleNodes.current.set(bubble.id, node);
              else bubbleNodes.current.delete(bubble.id);
            }}
          >
            <strong>{bubble.name}</strong>
            <span>{bubble.text}</span>
          </div>
        ))}
        {hovered && (
          <div className="seat-tip" ref={hoverNode}>
            {seatLabel(hovered)}: {hoveredPerson ? hoveredPerson.name : "Bấm để ngồi"}
          </div>
        )}
      </div>
    </div>
  );
});
