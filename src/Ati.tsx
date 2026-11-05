import type { CSSProperties } from "react";
import "./ati.css";

export type AtiPose = "wave" | "mask" | "sleep" | "cheer";

// Cut from the fan's own character sheet, so the mascot looks exactly like the drawing. Sizes are the files' own.
const ART: Record<AtiPose, { src: string; width: number; height: number }> = {
  wave: { src: "/brand/ati/wave.webp", width: 428, height: 560 },
  mask: { src: "/brand/ati/mask.webp", width: 447, height: 560 },
  sleep: { src: "/brand/ati/sleep.webp", width: 416, height: 560 },
  cheer: { src: "/brand/ati/cheer.webp", width: 420, height: 560 },
};

type Props = {
  pose?: AtiPose;
  className?: string;
  /** Seconds, so several Ati on one page do not move in step. */
  delay?: number;
};

/** T1's mascot Ati. The picture is fixed; CSS gives each pose its own motion (see ati.css). */
export function Ati({ pose = "wave", className = "", delay = 0 }: Props) {
  const art = ART[pose];
  return (
    <img
      className={`ati ati-${pose} ${className}`.trim()}
      src={art.src}
      width={art.width}
      height={art.height}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ "--ati-delay": `${delay}s` } as CSSProperties}
    />
  );
}

