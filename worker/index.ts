import { NAME_MAX, NAME_MIN, sanitizeLook, sanitizeName } from "../shared/look.ts";
import { ROOM_IDS, roomName, type RoomListing, type RoomSummary } from "../shared/protocol.ts";
import { clearedCookie, readSession, sessionCookie, userFrom, verifyGoogleCredential, type Session } from "./auth.ts";
import type { Env } from "./env.ts";

export { Room } from "./room.ts";

const NAME_ERROR = `Tên cần có từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...init.headers },
  });

const fail = (status: number, message: string) => json({ error: message }, { status });

function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

const roomStub = (env: Env, id: number) => env.ROOM.get(env.ROOM.idFromName(`room-${id}`));

function parseRoomId(value: string | null | undefined): number | null {
  const id = Number(value);
  return (ROOM_IDS as readonly number[]).includes(id) ? id : null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function signIn(env: Env, request: Request, session: Session): Promise<Response> {
  return json(userFrom(env, session), { headers: { "Set-Cookie": await sessionCookie(env, session, request) } });
}

async function listRooms(env: Env): Promise<RoomListing[]> {
  return Promise.all(
    ROOM_IDS.map(async (id) => {
      const response = await roomStub(env, id).fetch("https://room/summary");
      const summary = (await response.json()) as RoomSummary;
      return { ...summary, id, name: roomName(id) };
    }),
  );
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const isPost = request.method === "POST";
  if (isPost && !sameOrigin(request)) return fail(403, "Yêu cầu không đến từ trang của rạp.");

  if (path === "/api/config" && request.method === "GET") {
    return json({ googleClientId: env.GOOGLE_CLIENT_ID || null, devLogin: env.DEV_LOGIN === "true" });
  }
  if (path === "/api/me" && request.method === "GET") {
    const session = await readSession(env, request);
    return json(session && userFrom(env, session));
  }
  if (path === "/api/rooms" && request.method === "GET") {
    return json(await listRooms(env));
  }
  if (path === "/api/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return fail(426, "Cần kết nối WebSocket.");
    if (!sameOrigin(request)) return fail(403, "Yêu cầu không đến từ trang của rạp.");
    const roomId = parseRoomId(url.searchParams.get("room"));
    if (roomId === null) return fail(404, "Không có phòng chiếu này.");
    const session = await readSession(env, request);
    if (!session) return fail(401, "Bạn cần nhập tên để vào rạp.");
    return roomStub(env, roomId).fetch("https://room/ws", {
      headers: { Upgrade: "websocket", "X-User": encodeURIComponent(JSON.stringify(userFrom(env, session))) },
    });
  }

  const adminRoom = path.match(/^\/api\/admin\/rooms\/(\d+)$/);
  if (adminRoom && isPost) {
    const session = await readSession(env, request);
    if (!session) return fail(401, "Bạn cần đăng nhập.");
    if (!userFrom(env, session).admin) return fail(403, "Chỉ quản trị viên mới mở hoặc đóng được phòng.");
    const roomId = parseRoomId(adminRoom[1]);
    if (roomId === null) return fail(404, "Không có phòng chiếu này.");
    return roomStub(env, roomId).fetch("https://room/access", { method: "POST", body: await request.text() });
  }

  if (path === "/api/auth/guest" && isPost) {
    const body = await readJson(request);
    const name = sanitizeName(body?.name);
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { id: `guest:${crypto.randomUUID()}`, name, look: sanitizeLook(body?.look) });
  }
  if (path === "/api/auth/google" && isPost) {
    const body = await readJson(request);
    if (typeof body?.credential !== "string") return fail(400, "Thiếu thông tin đăng nhập Google.");
    const session = await verifyGoogleCredential(env, body.credential);
    return session ? signIn(env, request, session) : fail(401, "Google không xác nhận được tài khoản này.");
  }
  if (path === "/api/auth/dev" && isPost) {
    if (env.DEV_LOGIN !== "true") return fail(404, "Không tìm thấy.");
    const body = await readJson(request);
    const name = sanitizeName(body?.name);
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { id: `dev:${name}`, name, look: sanitizeLook(body?.look), devAdmin: body?.admin === true });
  }
  if (path === "/api/profile" && isPost) {
    const session = await readSession(env, request);
    if (!session) return fail(401, "Bạn cần nhập tên trước.");
    const body = await readJson(request);
    const name = sanitizeName(body?.name);
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { ...session, name, look: sanitizeLook(body?.look) });
  }
  if (path === "/api/auth/logout" && isPost) {
    return json({ ok: true }, { headers: { "Set-Cookie": clearedCookie() } });
  }
  return fail(404, "Không tìm thấy.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
