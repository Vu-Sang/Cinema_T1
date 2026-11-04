import type { Look } from "./look.ts";

export const CAPACITY = 100;
export const ROWS = 10;
export const SEATS_PER_ROW = 10;
export const MAX_CHAT_LENGTH = 300;
export const MAX_LED_LENGTH = 200;
export const ROOM_FULL_CODE = 4000;
export const ROOM_CLOSED_CODE = 4001;
export const DEFAULT_LED_TEXT = "Giữ im lặng khi trận đấu diễn ra. Không toxic, không blame tuyển thủ. T1 Fighting!";

export const ROOM_IDS = [1, 2, 3] as const;
export const roomName = (id: number) => `Phòng ${String(id).padStart(2, "0")}`;

export const ACTIONS = ["dance", "jump", "stand", "oxygen"] as const;
export type ActionKind = (typeof ACTIONS)[number];

export const REACTIONS = ["t1", "star", "cup", "heart", "flame", "gg"] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export type User = { id: string; name: string; admin: boolean; look: Look };

export type Playback = {
  videoId: string | null;
  title: string | null;
  isLive: boolean;
  status: "playing" | "paused";
  /** Position in seconds at the moment of updatedAt. */
  position: number;
  /** Server clock, in milliseconds. */
  updatedAt: number;
  revision: number;
};

export type ChatMessage = { id: string; userId: string; name: string; admin: boolean; text: string; at: number };

export type SeatedPerson = { id: string; name: string; admin: boolean; look: Look };

/** Seat number (1..100) -> who is sitting there. */
export type Seats = Record<number, SeatedPerson>;

export type RoomAccess = { isOpen: boolean; opensAt: number | null };

export type RoomSummary = RoomAccess & { playback: Playback; viewers: number; capacity: number };
export type RoomListing = RoomSummary & { id: number; name: string };

export type RoomAdminAction = { action: "open" } | { action: "close" } | { action: "schedule"; opensAt: number };

export type ClientMessage =
  | { t: "ping"; c: number }
  | { t: "seat"; seat: number | null }
  | { t: "chat"; text: string }
  | { t: "control"; action: "play" | "pause" }
  | { t: "control"; action: "seek"; position: number }
  | { t: "load"; url: string; isLive: boolean }
  | { t: "action"; kind: ActionKind }
  | { t: "react"; kind: ReactionKind }
  | { t: "profile"; name: string; look: Look }
  | { t: "led"; text: string };

export type ServerMessage =
  | {
      t: "welcome";
      you: User;
      playback: Playback;
      seats: Seats;
      viewers: number;
      messages: ChatMessage[];
      led: string;
      access: RoomAccess;
      now: number;
    }
  | { t: "playback"; playback: Playback; now: number }
  | { t: "action"; userId: string; kind: ActionKind }
  | { t: "react"; userId: string; kind: ReactionKind }
  | { t: "led"; text: string }
  | { t: "access"; access: RoomAccess }
  | { t: "seats"; seats: Seats; viewers: number }
  | { t: "chat"; message: ChatMessage }
  | { t: "pong"; c: number; now: number }
  | { t: "error"; message: string };

export function seatLabel(seat: number): string {
  const index = seat - 1;
  const row = String.fromCharCode(65 + Math.floor(index / SEATS_PER_ROW));
  return `${row}${(index % SEATS_PER_ROW) + 1}`;
}
