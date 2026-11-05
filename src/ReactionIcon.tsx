import type { PrankTool, ReactionKind } from "../shared/protocol.ts";

export const REACTION_LABELS: Record<ReactionKind, string> = {
  t1: "Logo T1",
  ati: "Ati",
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
  if (kind === "ati") return <img className="reaction-ati" src="/brand/ati/head.webp" alt="Ati" />;
  if (kind === "gg") return <span className="reaction-gg">GG</span>;
  const path = PATHS[kind]!;
  return (
    <svg className="reaction-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path.d} fill={path.fill} />
    </svg>
  );
}

export function PrankIcon({ tool }: { tool: PrankTool }) {
  if (tool === "throw") {
    return <img className="prank-icon-head" src="/brand/ati/head.webp" alt="Ném đầu Ati" />;
  }
  if (tool === "punch") {
    return (
      <svg className="reaction-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10.5 3a1.5 1.5 0 0 0-1.5 1.5v1.7A1.5 1.5 0 0 0 7.5 7v1.2A1.5 1.5 0 0 0 6 9.5v2.8c0 .2.1.4.2.6C4.9 13.5 4 14.9 4 16.5 4 19 6 21 8.5 21h4c3.6 0 6.5-2.9 6.5-6.5V9.8a2.8 2.8 0 0 0-2.8-2.8h-1.2V4.5A1.5 1.5 0 0 0 13.5 3h-3z"
          fill="#e2012d"
        />
        <path d="M9 7.5h6M7.5 10.5h9M6 13.5h7" stroke="#ffd36b" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="reaction-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.2 3.8a6.5 6.5 0 0 0-9.2 0L3.5 11.3a1 1 0 0 0-.2.4l-1.3 6.5a1 1 0 0 0 1.2 1.2l6.5-1.3a1 1 0 0 0 .4-.2l7.5-7.5a6.5 6.5 0 0 0 0-9.2zM8.5 16.5l-3.8.8.8-3.8 6.2-6.2 3 3-6.2 6.2z"
        fill="#ffd36b"
      />
      <path d="M5.5 17.5l6-6" stroke="#996515" strokeWidth="1" strokeLinecap="round" />
      <circle cx="18" cy="18" r="1.2" fill="#fff" />
      <circle cx="20" cy="14" r="0.8" fill="#ffd36b" />
      <circle cx="15" cy="20" r="0.8" fill="#ffd36b" />
    </svg>
  );
}
