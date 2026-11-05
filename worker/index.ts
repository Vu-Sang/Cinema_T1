import { NAME_MAX, NAME_MIN, sanitizeLook, sanitizeName } from "../shared/look.ts";
import { ROOM_IDS, roomName, type RoomListing, type RoomSummary } from "../shared/protocol.ts";
import {
  clearedCookie,
  DEV_SESSION_SECONDS,
  readSession,
  sessionCookie,
  sessionFromSupabase,
  SUPABASE_SESSION_SECONDS,
  userFrom,
  type Session,
} from "./auth.ts";
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

async function signIn(env: Env, request: Request, session: Session, maxAgeSeconds: number): Promise<Response> {
  return json(userFrom(env, session), { headers: { "Set-Cookie": await sessionCookie(env, session, request, maxAgeSeconds) } });
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

async function exchangeSupabaseToken(env: Env, request: Request): Promise<Response> {
  const body = await readJson(request);
  if (typeof body?.accessToken !== "string") return fail(400, "Thiếu thông tin đăng nhập.");
  let result;
  try {
    result = await sessionFromSupabase(env, body.accessToken);
  } catch (error) {
    console.error("Supabase session exchange failed", error);
    return fail(503, "Không kết nối được hệ thống tài khoản. Hãy thử lại sau ít phút.");
  }
  if (result.kind === "invalid") {
    return json({ error: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." }, { status: 401, headers: { "Set-Cookie": clearedCookie() } });
  }
  if (result.kind === "banned") {
    const until = result.until ? ` đến ${new Date(result.until).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : "";
    return json({ error: `Tài khoản này đang bị chặn${until}.`, banned: true }, { status: 403, headers: { "Set-Cookie": clearedCookie() } });
  }
  return signIn(env, request, result.session, SUPABASE_SESSION_SECONDS);
}

/** Sign-ins that skip Supabase, for local runs and the test scripts. Absent unless DEV_LOGIN=true. */
async function handleDevAuth(request: Request, env: Env, path: string): Promise<Response | null> {
  const body = await readJson(request);
  const name = sanitizeName(body?.name);
  if (path === "/api/auth/guest") {
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { id: `guest:${crypto.randomUUID()}`, name, look: sanitizeLook(body?.look) }, DEV_SESSION_SECONDS);
  }
  if (path === "/api/auth/dev") {
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { id: `dev:${name}`, name, look: sanitizeLook(body?.look), devAdmin: body?.admin === true }, DEV_SESSION_SECONDS);
  }
  if (path === "/api/profile") {
    const session = await readSession(env, request);
    if (!session) return fail(401, "Bạn cần nhập tên trước.");
    if (!name) return fail(400, NAME_ERROR);
    return signIn(env, request, { ...session, name, look: sanitizeLook(body?.look) }, DEV_SESSION_SECONDS);
  }
  return null;
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const isPost = request.method === "POST";
  if (isPost && !sameOrigin(request)) return fail(403, "Yêu cầu không đến từ trang của rạp.");

  if (path === "/api/config" && request.method === "GET") {
    return json({ devLogin: env.DEV_LOGIN === "true" });
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

  if (path === "/api/music-config") {
    const stub = env.ROOM.get(env.ROOM.idFromName("site-settings"));
    if (request.method === "GET") {
      return stub.fetch("https://room/settings");
    }
    if (isPost) {
      const session = await readSession(env, request);
      if (!session) return fail(401, "Bạn cần đăng nhập.");
      if (!userFrom(env, session).admin) return fail(403, "Chỉ quản trị viên mới sửa được cấu hình nhạc.");
      return stub.fetch("https://room/settings", { method: "POST", body: await request.text() });
    }
  }

  if (path === "/api/session" && isPost) return exchangeSupabaseToken(env, request);
  if (path === "/api/auth/logout" && isPost) {
    return json({ ok: true }, { headers: { "Set-Cookie": clearedCookie() } });
  }
  if (isPost && env.DEV_LOGIN === "true") {
    const response = await handleDevAuth(request, env, path);
    if (response) return response;
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
