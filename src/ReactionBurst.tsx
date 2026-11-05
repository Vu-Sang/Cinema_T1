import { useState, type CSSProperties } from "react";
import type { ReactionKind } from "../shared/protocol.ts";
import { ReactionIcon } from "./ReactionIcon.tsx";

/** How long each reaction stays on screen, in milliseconds. */
export const BURST_MS: Record<ReactionKind, number> = { t1: 2200, ati: 2600, star: 2200, cup: 3200, heart: 2600, flame: 2400, gg: 2600 };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const vars = (values: Record<string, string | number>) => values as unknown as CSSProperties;

type Piece = { dx: number; dy: number; rot: number; delay: number; size: number; sway: number };

function pieces(count: number, make: (index: number) => Piece): Piece[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/**
 * What a reaction looks like around the head of whoever sent it. Each kind moves its own way:
 * the logo stamps down and sends shockwaves, Ati hops along the floor, stars burst and fall, the cup rises in a glow,
 * hearts drift up swaying, flames shoot up and flicker, and GG pops in big.
 */
export function Burst({ kind, name }: { kind: ReactionKind; name: string }) {
  const [parts] = useState<Piece[]>(() => {
    switch (kind) {
      case "t1":
        return pieces(6, (i) => ({ dx: Math.cos((i / 6) * 6.28 - 1.57) * 70, dy: Math.sin((i / 6) * 6.28 - 1.57) * 55 - 30, rot: rand(-30, 30), delay: 0.2 + i * 0.03, size: 0.55, sway: 0 }));
      case "ati":
        return pieces(5, (i) => ({ dx: (i - 2) * 46 + rand(-8, 8), dy: 0, rot: rand(-25, 25), delay: i * 0.09, size: i === 2 ? 1.25 : 0.8, sway: 0 }));
      case "star":
        return pieces(11, (i) => ({ dx: Math.cos((i / 11) * 6.28) * rand(55, 110), dy: Math.sin((i / 11) * 6.28) * rand(40, 90) - 60, rot: rand(-240, 240), delay: rand(0, 0.12), size: rand(0.55, 1), sway: 0 }));
      case "cup":
        return pieces(10, (i) => ({ dx: Math.cos((i / 10) * 6.28) * rand(40, 80), dy: Math.sin((i / 10) * 6.28) * rand(30, 70) - 70, rot: 0, delay: 0.3 + rand(0, 0.5), size: rand(0.3, 0.55), sway: 0 }));
      case "heart":
        return pieces(9, (i) => ({ dx: rand(-40, 40), dy: -rand(110, 190), rot: 0, delay: i * 0.12, size: rand(0.6, 1.1), sway: rand(10, 22) }));
      case "flame":
        return pieces(7, (i) => ({ dx: (i - 3) * 16 + rand(-6, 6), dy: -rand(120, 200), rot: 0, delay: i * 0.07, size: rand(0.7, 1.2), sway: rand(4, 9) }));
      default:
        return [];
    }
  });

  if (kind === "gg") {
    return (
      <div className="burst burst-gg" aria-hidden="true">
        <span>GG</span>
        <small>{name}</small>
      </div>
    );
  }
  if (kind === "t1") {
    return (
      <div className="burst burst-t1" aria-hidden="true">
        <i className="burst-ring" />
        <i className="burst-ring is-late" />
        <div className="burst-stamp">
          <ReactionIcon kind="t1" />
        </div>
        {parts.map((part, index) => (
          <b key={index} className="burst-fan" style={vars({ "--dx": `${part.dx}px`, "--dy": `${part.dy}px`, "--rot": `${part.rot}deg`, "--delay": `${part.delay}s`, "--size": part.size })}>
            <ReactionIcon kind="t1" />
          </b>
        ))}
      </div>
    );
  }
  if (kind === "ati") {
    return (
      <div className="burst burst-ati" aria-hidden="true">
        {parts.map((part, index) => (
          <b key={index} className="burst-hop" style={vars({ "--dx": `${part.dx}px`, "--rot": `${part.rot}deg`, "--delay": `${part.delay}s`, "--size": part.size })}>
            <ReactionIcon kind="ati" />
          </b>
        ))}
      </div>
    );
  }
  if (kind === "star") {
    return (
      <div className="burst" aria-hidden="true">
        {parts.map((part, index) => (
          <b key={index} className="burst-shot" style={vars({ "--dx": `${part.dx}px`, "--dy": `${part.dy}px`, "--rot": `${part.rot}deg`, "--delay": `${part.delay}s`, "--size": part.size })}>
            <ReactionIcon kind="star" />
          </b>
        ))}
      </div>
    );
  }
  if (kind === "cup") {
    return (
      <div className="burst burst-cup" aria-hidden="true">
        <i className="burst-halo" />
        <div className="burst-trophy">
          <ReactionIcon kind="cup" />
        </div>
        {parts.map((part, index) => (
          <b key={index} className="burst-spark" style={vars({ "--dx": `${part.dx}px`, "--dy": `${part.dy}px`, "--delay": `${part.delay}s`, "--size": part.size })}>
            <ReactionIcon kind="star" />
          </b>
        ))}
      </div>
    );
  }
  // Hearts and flames rise like smoke: the outer element climbs, the inner one sways.
  return (
    <div className={`burst burst-${kind}`} aria-hidden="true">
      {parts.map((part, index) => (
        <b key={index} className="burst-rise" style={vars({ "--dx": `${part.dx}px`, "--dy": `${part.dy}px`, "--delay": `${part.delay}s`, "--size": part.size, "--sway": `${part.sway}px` })}>
          <span>
            <ReactionIcon kind={kind} />
          </span>
        </b>
      ))}
    </div>
  );
}

/** Effects that fill the whole hall rather than one seat: flames light the room, the cup rains confetti, GG shouts. */
export function HallEffect({ kind, name }: { kind: ReactionKind; name: string }) {
  const [confetti] = useState(() =>
    kind === "cup" ? Array.from({ length: 38 }, () => ({ left: rand(0, 100), delay: rand(0, 1.2), fall: rand(1.6, 2.6), rot: rand(180, 720), hue: Math.floor(rand(0, 3)) })) : [],
  );
  if (kind === "flame") return <div className="hall-glow" aria-hidden="true" />;
  if (kind === "t1") return <div className="hall-flash" aria-hidden="true" />;
  if (kind === "cup") {
    return (
      <div className="hall-confetti" aria-hidden="true">
        {confetti.map((piece, index) => (
          <i key={index} className={`confetti-${piece.hue}`} style={vars({ left: `${piece.left}%`, "--delay": `${piece.delay}s`, "--fall": `${piece.fall}s`, "--rot": `${piece.rot}deg` })} />
        ))}
      </div>
    );
  }
  if (kind === "gg") {
    return (
      <div className="hall-gg" aria-hidden="true">
        <span>GG</span>
        <small>{name} cổ vũ cả rạp</small>
      </div>
    );
  }
  return null;
}
