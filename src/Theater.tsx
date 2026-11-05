import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { CAST, seatLabel, type ActionKind, type ChatMessage, type PrankTool, type ReactionKind, type Seats, type Sticker } from "../shared/protocol.ts";
import { BURST_MS, Burst, HallEffect } from "./ReactionBurst.tsx";
import type { TheaterScene } from "./theater/scene.ts";

const BUBBLE_MS = 6000;
const BUBBLE_MAX_LENGTH = 80;
const MAX_FLOATERS = 40;

export type TheaterHandle = {
  playAction: (userId: string, kind: ActionKind) => void;
  showBubble: (message: ChatMessage) => void;
  showReaction: (userId: string, kind: ReactionKind) => void;
  prank: (userId: string, tool: PrankTool, target: number) => void;
};

type Bubble = { id: string; userId: string; name: string; text?: string; sticker?: Sticker };
type Floater = { id: number; kind: ReactionKind; x: number; y: number; name: string };
type HallFx = { id: number; kind: ReactionKind; name: string };

type Props = {
  seats: Seats;
  youId: string | null;
  lightsOn: boolean;
  topRef: RefObject<HTMLElement | null>;
  bottomRef: RefObject<HTMLElement | null>;
  onPick: (seat: number) => void;
  onCastClick: (index: number) => void;
  /** What a click on the lineup does right now, shown beside the name. */
  castHint: string;
};

export const Theater = forwardRef<TheaterHandle, Props>(function Theater({ seats, youId, lightsOn, topRef, bottomRef, onPick, onCastClick, castHint }, handle) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TheaterScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredCast, setHoveredCast] = useState<number | null>(null);
  const castNode = useRef<HTMLDivElement>(null);
  const hoveredCastRef = useRef(hoveredCast);
  hoveredCastRef.current = hoveredCast;
  const onCastClickRef = useRef(onCastClick);
  onCastClickRef.current = onCastClick;
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextFloater = useRef(0);
  const [hallFx, setHallFx] = useState<HallFx[]>([]);
  const seatsNow = useRef(seats);
  seatsNow.current = seats;
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
    if (castNode.current && hoveredCastRef.current !== null) {
      const at = current.castOnScreen(hoveredCastRef.current);
      castNode.current.style.transform = `translate(calc(${at.x}px - 50%), calc(${at.y}px - 100%))`;
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
          onCastClick: (index) => onCastClickRef.current(index),
          onCastHover: setHoveredCast,
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
        const text = message.sticker
          ? undefined
          : message.text.length > BUBBLE_MAX_LENGTH
            ? `${message.text.slice(0, BUBBLE_MAX_LENGTH)}…`
            : message.text;
        const bubble: Bubble = { id: message.id, userId: message.userId, name: message.name, text, sticker: message.sticker };
        // One bubble per person: a new message replaces their last one.
        setBubbles((current) => [...current.filter((item) => item.userId !== message.userId), bubble]);
        setTimeout(() => setBubbles((current) => current.filter((item) => item.id !== message.id)), BUBBLE_MS);
      },
      prank: (userId, tool, target) => {
        const current = scene.current;
        if (!current || !CAST[target]) return;
        current.prank(userId, tool, target);
        // The one poked answers a moment later, once the punch or the flying head has landed.
        const delay = tool === "throw" ? 800 : 150;
        setTimeout(() => {
          const id = `quip-${(nextFloater.current += 1)}`;
          const text = scene.current?.castQuip(target, tool);
          if (!text) return;
          const bubble: Bubble = { id, userId: `cast:${CAST[target]}`, name: CAST[target], text };
          setBubbles((list) => [...list.filter((item) => item.userId !== bubble.userId), bubble]);
          setTimeout(() => setBubbles((list) => list.filter((item) => item.id !== id)), BUBBLE_MS - 1500);
        }, delay);
      },
      showReaction: (userId, kind) => {
        scene.current?.playReaction(userId, kind);
        scene.current?.cheer(userId, kind);
        const at = scene.current?.headOnScreen(userId) ?? {
          x: window.innerWidth / 2 + (Math.random() - 0.5) * Math.min(360, window.innerWidth * 0.7),
          y: window.innerHeight - 100 - Math.random() * 60,
        };
        const id = (nextFloater.current += 1);
        const name = Object.values(seatsNow.current).find((person) => person.id === userId)?.name ?? "";
        setFloaters((current) => [...current.slice(-(MAX_FLOATERS - 1)), { id, kind, x: at.x, y: at.y, name }]);
        setTimeout(() => setFloaters((current) => current.filter((item) => item.id !== id)), BURST_MS[kind]);
        if (kind === "flame" || kind === "cup" || kind === "gg" || kind === "t1") {
          setHallFx((current) => [...current.filter((item) => item.kind !== kind), { id, kind, name }]);
          setTimeout(() => setHallFx((current) => current.filter((item) => item.id !== id)), BURST_MS[kind] + 400);
        }
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
            <Burst kind={floater.kind} name={floater.name} />
          </div>
        ))}
        {hallFx.map((item) => (
          <HallEffect key={item.id} kind={item.kind} name={item.name} />
        ))}
        {bubbles.map((bubble) => (
          <div
            key={bubble.id}
            className={`bubble${bubble.userId === youId ? " is-you" : ""}${bubble.sticker ? " is-sticker" : ""}`}
            ref={(node) => {
              if (node) bubbleNodes.current.set(bubble.id, node);
              else bubbleNodes.current.delete(bubble.id);
            }}
          >
            <strong>{bubble.name}</strong>
            {bubble.sticker ? (
              <img src={bubble.sticker.url} alt={bubble.sticker.name} className="bubble-sticker-img" />
            ) : (
              <span>{bubble.text}</span>
            )}
          </div>
        ))}
        {hoveredCast !== null && (
          <div className="seat-tip cast-tip" ref={castNode}>
            {CAST[hoveredCast]}: {castHint}
          </div>
        )}
        {hovered && (
          <div className="seat-tip" ref={hoverNode}>
            {seatLabel(hovered)}: {hoveredPerson ? hoveredPerson.name : "Bấm để ngồi"}
          </div>
        )}
      </div>
    </div>
  );
});
