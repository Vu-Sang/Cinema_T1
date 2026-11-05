import { DurableObject } from "cloudflare:workers";
import { sanitizeLook, sanitizeName } from "../shared/look.ts";
import {
  ACTIONS,
  CAPACITY,
  DEFAULT_LED_TEXT,
  MAX_CHAT_LENGTH,
  MAX_LED_LENGTH,
  REACTIONS,
  ROOM_CLOSED_CODE,
  ROOM_FULL_CODE,
  type ActionKind,
  type ChatMessage,
  type ClientMessage,
  type Playback,
  type ReactionKind,
  CAST,
  PRANK_TOOLS,
  type PrankTool,
  type RoomAccess,
  type RoomAdminAction,
  type RoomSummary,
  type Seats,
  type ServerMessage,
  type User,
} from "../shared/protocol.ts";
import { expectedPosition, parseYouTubeId } from "../shared/sync.ts";
import { findSticker } from "../shared/stickers.ts";
import type { Env } from "./env.ts";

const CHAT_HISTORY = 50;
const CHAT_INTERVAL_MS = 700;
const ACTION_INTERVAL_MS = 1500;
const REACTION_INTERVAL_MS = 350;
const PRANK_INTERVAL_MS = 450;
const MAX_SCHEDULE_MS = 365 * 86_400_000;
/** Browsers ping every 20 seconds, slower in a background tab. Silence this long means the connection is dead. */
const STALE_AFTER_MS = 150_000;
const STALE_CLOSE_CODE = 4002;

/** Kept on each socket so it survives the Durable Object hibernating. */
type Attachment = { user: User; seat: number | null; lastChatAt: number; lastActionAt: number; lastReactionAt: number; lastPrankAt?: number; lastSeenAt: number };

const EMPTY_PLAYBACK: Playback = {
  videoId: null,
  title: null,
  isLive: false,
  status: "paused",
  position: 0,
  updatedAt: 0,
  revision: 0,
};

const CLOSED: RoomAccess = { isOpen: false, opensAt: null };

const send = (socket: WebSocket, message: ServerMessage) => socket.send(JSON.stringify(message));

export class Room extends DurableObject<Env> {
  private playback: Playback = EMPTY_PLAYBACK;
  private messages: ChatMessage[] = [];
  private led = DEFAULT_LED_TEXT;
  private access: RoomAccess = CLOSED;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.playback = (await ctx.storage.get<Playback>("playback")) ?? EMPTY_PLAYBACK;
      this.messages = (await ctx.storage.get<ChatMessage[]>("messages")) ?? [];
      this.led = (await ctx.storage.get<string>("led")) ?? DEFAULT_LED_TEXT;
      this.access = (await ctx.storage.get<RoomAccess>("access")) ?? CLOSED;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    await this.openIfScheduled();
    this.dropDeadSockets();
    if (pathname === "/summary") {
      const summary: RoomSummary = { ...this.access, playback: this.playback, viewers: this.viewerIds().size, capacity: CAPACITY };
      return Response.json(summary);
    }
    if (pathname === "/ws") return this.join(JSON.parse(decodeURIComponent(request.headers.get("X-User")!)) as User);
    // Only the Worker can reach this object, and it checks the admin role before forwarding.
    if (pathname === "/access" && request.method === "POST") return this.changeAccess(request);
    if (pathname === "/settings") {
      if (request.method === "GET") {
        const stored = await this.ctx.storage.get("music-settings");
        return Response.json(stored ?? null);
      }
      if (request.method === "POST") {
        try {
          const data = await request.json();
          await this.ctx.storage.put("music-settings", data);
          return Response.json(data);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
      }
    }
    return new Response("Not found", { status: 404 });
  }

  /** A scheduled opening needs no timer: whoever asks first after the time opens the doors. */
  private async openIfScheduled(): Promise<void> {
    if (this.access.opensAt !== null && this.access.opensAt <= Date.now()) await this.setAccess({ isOpen: true, opensAt: null });
  }

  private async changeAccess(request: Request): Promise<Response> {
    const fail = (message: string) => Response.json({ error: message }, { status: 400 });
    let body: RoomAdminAction;
    try {
      body = await request.json();
    } catch {
      return fail("Yêu cầu không hợp lệ.");
    }
    if (body?.action === "open") {
      await this.setAccess({ isOpen: true, opensAt: null });
    } else if (body?.action === "close") {
      await this.setAccess(CLOSED);
      if (this.playback.status === "playing") {
        await this.setPlayback({ ...this.playback, status: "paused", position: expectedPosition(this.playback, Date.now()) });
      }
      for (const socket of this.openSockets()) {
        if (!this.attachment(socket).user.admin) socket.close(ROOM_CLOSED_CODE, "Room closed");
      }
      this.broadcastSeats();
    } else if (body?.action === "schedule") {
      const now = Date.now();
      if (!Number.isFinite(body.opensAt) || body.opensAt <= now || body.opensAt > now + MAX_SCHEDULE_MS) {
        return fail("Hãy chọn thời điểm trong tương lai, không quá một năm.");
      }
      await this.setAccess({ isOpen: false, opensAt: body.opensAt });
    } else {
      return fail("Yêu cầu không hợp lệ.");
    }
    return Response.json(this.access);
  }

  private async setAccess(access: RoomAccess): Promise<void> {
    this.access = access;
    await this.ctx.storage.put("access", access);
    this.broadcast({ t: "access", access });
  }

  private join(user: User): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    const reject = (code: number, reason: string) => {
      server.accept();
      server.close(code, reason);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!this.access.isOpen && !user.admin) return reject(ROOM_CLOSED_CODE, "Room closed");
    const viewers = this.viewerIds();
    if (!viewers.has(user.id) && viewers.size >= CAPACITY && !user.admin) return reject(ROOM_FULL_CODE, "Room is full");

    // The same person opening another tab keeps the seat they already hold.
    const existing = this.openSockets().find((socket) => this.attachment(socket).user.id === user.id);
    const attachment: Attachment = {
      user,
      seat: existing ? this.attachment(existing).seat : null,
      lastChatAt: 0,
      lastActionAt: 0,
      lastReactionAt: 0,
      lastSeenAt: Date.now(),
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    const { seats, viewers: viewerCount } = this.seatState();
    send(server, {
      t: "welcome",
      you: user,
      playback: this.playback,
      seats,
      viewers: viewerCount,
      messages: this.messages,
      led: this.led,
      access: this.access,
      now: Date.now(),
    });
    this.broadcast({ t: "seats", seats, viewers: viewerCount }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    switch (message?.t) {
      case "ping":
        socket.serializeAttachment({ ...this.attachment(socket), lastSeenAt: Date.now() });
        this.dropDeadSockets();
        if (typeof message.c === "number") send(socket, { t: "pong", c: message.c, now: Date.now() });
        return;
      case "seat":
        return this.takeSeat(socket, message.seat);
      case "chat":
        return this.postChat(socket, message.text, message.stickerId);
      case "control":
        return this.control(socket, message);
      case "load":
        return this.load(socket, message.url, message.isLive === true);
      case "action":
        return this.act(socket, message.kind);
      case "react":
        return this.react(socket, message.kind);
      case "prank":
        return this.prank(socket, message.tool, message.target);
      case "profile":
        return this.updateProfile(socket, message.name, message.look);
      case "led":
        return this.setLed(socket, message.text);
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    this.broadcastSeats(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.broadcastSeats(socket);
  }

  private act(socket: WebSocket, kind: unknown): void {
    if (!ACTIONS.includes(kind as ActionKind)) return;
    const attachment = this.attachment(socket);
    if (attachment.seat === null) {
      send(socket, { t: "error", message: "Hãy chọn ghế trước khi thực hiện hành động." });
      return;
    }
    const now = Date.now();
    if (now - attachment.lastActionAt < ACTION_INTERVAL_MS) return;
    socket.serializeAttachment({ ...attachment, lastActionAt: now });
    this.broadcast({ t: "action", userId: attachment.user.id, kind: kind as ActionKind });
  }

  private react(socket: WebSocket, kind: unknown): void {
    if (!REACTIONS.includes(kind as ReactionKind)) return;
    const attachment = this.attachment(socket);
    const now = Date.now();
    if (now - attachment.lastReactionAt < REACTION_INTERVAL_MS) return;
    socket.serializeAttachment({ ...attachment, lastReactionAt: now });
    this.broadcast({ t: "react", userId: attachment.user.id, kind: kind as ReactionKind });
  }

  /** Someone pokes the lineup on stage. Nothing is stored: it is a moment everyone in the room sees together. */
  private prank(socket: WebSocket, tool: unknown, target: unknown): void {
    if (!PRANK_TOOLS.includes(tool as PrankTool)) return;
    if (!Number.isInteger(target) || (target as number) < 0 || (target as number) >= CAST.length) return;
    const attachment = this.attachment(socket);
    const now = Date.now();
    if (now - (attachment.lastPrankAt ?? 0) < PRANK_INTERVAL_MS) return;
    socket.serializeAttachment({ ...attachment, lastPrankAt: now });
    this.broadcast({ t: "prank", userId: attachment.user.id, tool: tool as PrankTool, target: target as number });
  }

  /** Browsers send this after saving a character, so the room sees it without a reconnect. */
  private updateProfile(socket: WebSocket, rawName: unknown, rawLook: unknown): void {
    const name = sanitizeName(rawName);
    if (!name) return;
    const look = sanitizeLook(rawLook);
    const { user } = this.attachment(socket);
    for (const other of this.openSockets()) {
      const attachment = this.attachment(other);
      if (attachment.user.id === user.id) other.serializeAttachment({ ...attachment, user: { ...attachment.user, name, look } });
    }
    this.broadcastSeats();
  }

  private async setLed(socket: WebSocket, input: unknown): Promise<void> {
    if (!this.requireAdmin(socket) || typeof input !== "string") return;
    this.led = input.trim().slice(0, MAX_LED_LENGTH) || DEFAULT_LED_TEXT;
    await this.ctx.storage.put("led", this.led);
    this.broadcast({ t: "led", text: this.led });
  }

  private takeSeat(socket: WebSocket, seat: unknown): void {
    if (seat !== null && (!Number.isInteger(seat) || (seat as number) < 1 || (seat as number) > CAPACITY)) return;
    const { user } = this.attachment(socket);
    if (seat !== null) {
      const taken = this.seatState().seats[seat as number];
      if (taken && taken.id !== user.id) {
        send(socket, { t: "error", message: "Ghế này vừa có người ngồi. Hãy chọn ghế khác." });
        return;
      }
    }
    for (const other of this.openSockets()) {
      const attachment = this.attachment(other);
      if (attachment.user.id === user.id) other.serializeAttachment({ ...attachment, seat: seat as number | null });
    }
    this.broadcastSeats();
  }

  private async postChat(socket: WebSocket, input: unknown, stickerId?: unknown): Promise<void> {
    const rawText = typeof input === "string" ? input.trim().slice(0, MAX_CHAT_LENGTH) : "";
    const sticker = typeof stickerId === "string" ? findSticker(stickerId) : undefined;
    if (!rawText && !sticker) return;
    const text = sticker && !rawText ? `[Sticker: ${sticker.name}]` : rawText;
    const attachment = this.attachment(socket);
    const now = Date.now();
    if (now - attachment.lastChatAt < CHAT_INTERVAL_MS) {
      send(socket, { t: "error", message: "Bạn đang gửi quá nhanh. Đợi một chút rồi gửi lại." });
      return;
    }
    socket.serializeAttachment({ ...attachment, lastChatAt: now });
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      userId: attachment.user.id,
      name: attachment.user.name,
      admin: attachment.user.admin,
      text,
      sticker,
      at: now,
    };
    this.messages = [...this.messages, message].slice(-CHAT_HISTORY);
    await this.ctx.storage.put("messages", this.messages);
    this.broadcast({ t: "chat", message });
  }

  private async control(socket: WebSocket, message: Extract<ClientMessage, { t: "control" }>): Promise<void> {
    if (!this.requireAdmin(socket)) return;
    const { playback } = this;
    if (!playback.videoId) return;
    const current = expectedPosition(playback, Date.now());
    if (message.action === "play") {
      await this.setPlayback({ ...playback, status: "playing", position: current });
    } else if (message.action === "pause") {
      await this.setPlayback({ ...playback, status: "paused", position: current });
    } else if (message.action === "seek") {
      if (playback.isLive) {
        send(socket, { t: "error", message: "Không thể tua khi đang phát trực tiếp." });
        return;
      }
      if (!Number.isFinite(message.position)) return;
      await this.setPlayback({ ...playback, position: Math.max(0, message.position) });
    }
  }

  private async load(socket: WebSocket, url: unknown, isLive: boolean): Promise<void> {
    if (!this.requireAdmin(socket)) return;
    const videoId = typeof url === "string" ? parseYouTubeId(url) : null;
    if (!videoId) {
      send(socket, { t: "error", message: "Link này không phải video YouTube. Hãy dán link dạng youtube.com/watch?v=..." });
      return;
    }
    const oembed = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    );
    if (oembed.status === 401 || oembed.status === 403) {
      send(socket, { t: "error", message: "Chủ kênh không cho phép nhúng video này. Hãy chọn video khác." });
      return;
    }
    if (!oembed.ok) {
      send(socket, { t: "error", message: "Không tìm thấy video này trên YouTube. Hãy kiểm tra lại link." });
      return;
    }
    const { title } = (await oembed.json()) as { title?: string };
    await this.setPlayback({ ...EMPTY_PLAYBACK, videoId, title: title ?? null, isLive });
  }

  private requireAdmin(socket: WebSocket): boolean {
    if (this.attachment(socket).user.admin) return true;
    send(socket, { t: "error", message: "Chỉ quản trị viên mới điều khiển được phòng chiếu." });
    return false;
  }

  private async setPlayback(next: Playback): Promise<void> {
    const now = Date.now();
    this.playback = { ...next, updatedAt: now, revision: this.playback.revision + 1 };
    await this.ctx.storage.put("playback", this.playback);
    this.broadcast({ t: "playback", playback: this.playback, now });
  }

  /** A connection can vanish without a close event, and would otherwise hold its seat for good. */
  private dropDeadSockets(): void {
    const deadline = Date.now() - STALE_AFTER_MS;
    let dropped = false;
    for (const socket of this.openSockets()) {
      if ((this.attachment(socket).lastSeenAt ?? 0) >= deadline) continue;
      socket.close(STALE_CLOSE_CODE, "No ping received");
      dropped = true;
    }
    if (dropped) this.broadcastSeats();
  }

  private attachment(socket: WebSocket): Attachment {
    return socket.deserializeAttachment() as Attachment;
  }

  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket !== except && socket.readyState === WebSocket.OPEN);
  }

  private viewerIds(except?: WebSocket): Set<string> {
    return new Set(this.openSockets(except).map((socket) => this.attachment(socket).user.id));
  }

  private seatState(except?: WebSocket): { seats: Seats; viewers: number } {
    const seats: Seats = {};
    for (const socket of this.openSockets(except)) {
      const { user, seat } = this.attachment(socket);
      if (seat !== null) seats[seat] = { id: user.id, name: user.name, admin: user.admin, look: user.look };
    }
    return { seats, viewers: this.viewerIds(except).size };
  }

  private broadcastSeats(except?: WebSocket): void {
    this.broadcast({ t: "seats", ...this.seatState(except) }, except);
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const text = JSON.stringify(message);
    for (const socket of this.openSockets(except)) socket.send(text);
  }
}
