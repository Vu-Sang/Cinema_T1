import type { ReactionKind } from "../shared/protocol.ts";

export const REACTION_LABELS: Record<ReactionKind, string> = {
  t1: "Logo T1",
  star: "Ngôi sao",
  cup: "Cúp vô địch",
  heart: "Trái tim",
  flame: "Ngọn lửa",
  gg: "GG",
};

const PATHS: Partial<Record<ReactionKind, { d: string; fill: string }>> = {
  star: { d: "M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8L12 2.5Z", fill: "#ffd36b" },
  cup: {
    d: "M7 3h10v2h4v3a4 4 0 0 1-4.3 4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 7.3 12 4 4 0 0 1 3 8V5h4V3Zm0 4H5v1a2 2 0 0 0 2 2V7Zm10 0v3a2 2 0 0 0 2-2V7h-2Z",
    fill: "#e7bf60",
  },
  heart: { d: "M12 21s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 8.5 2.9C20.5 15.8 12 21 12 21Z", fill: "#e2012d" },
  flame: { d: "M12.5 2c.6 3.6-3.8 5.6-3.8 9.6 0 .9.3 1.7.8 2.3-.2-2 1.2-3.2 2.4-4.4.3 2.4 3 3.6 3 6.5a3.9 3.9 0 0 1-1.7 3.2c3-.6 5.3-3 5.3-6.5C18.5 8.200 14.900 6 12.500 2ZM8 15.500A5 5 0 0 0 12 22a4.700 4.700 0 0 1-4-6.500Z", fill: "#ff7a1a" },
};

export function ReactionIcon({ kind }: { kind: ReactionKind }) {
  if (kind === "t1") return <img className="reaction-t1" src="/brand/t1-logo.svg" alt="" />;
  if (kind === "gg") return <span className="reaction-gg">GG</span>;
  const path = PATHS[kind]!;
  return (
    <svg className="reaction-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path.d} fill={path.fill} />
    </svg>
  );
}
