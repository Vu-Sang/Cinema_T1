import { NAME_MAX, NAME_MIN, sanitizeName, type Look } from "../shared/look.ts";
import type { MusicConfig, RoomAdminAction, RoomListing, User } from "../shared/protocol.ts";
import { supabase } from "./supabase.ts";

export type AuthConfig = { devLogin: boolean };

const NAME_ERROR = `Tên cần có từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`;

/** A signed-in person who is refused entry; the app signs them out rather than retrying. */
export class BannedError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data.error ?? "Không gửi được yêu cầu. Hãy thử lại.";
    throw data.banned ? new BannedError(message) : new Error(message);
  }
  return data;
}

export const fetchConfig = () => getJson<AuthConfig>("/api/config");
export const fetchMe = () => getJson<User | null>("/api/me");
export const fetchRooms = () => getJson<RoomListing[]>("/api/rooms");
export const changeRoomAccess = (roomId: number, action: RoomAdminAction) => postJson(`/api/admin/rooms/${roomId}`, action);
export const fetchMusicConfig = () => getJson<MusicConfig | null>("/api/music-config").catch(() => null);
export const saveMusicConfig = (config: MusicConfig) => postJson<MusicConfig>("/api/music-config", config);

/** Swaps a Supabase token for the site's own cookie, which is what rooms and admin actions check. */
export const exchangeSession = (accessToken: string) => postJson<User>("/api/session", { accessToken });

/** Who is signed in right now, renewing the cookie from the Supabase session when there is one. */
export async function restoreUser(): Promise<User | null> {
  const session = supabase && (await supabase.auth.getSession()).data.session;
  if (!session) return fetchMe();
  try {
    return await exchangeSession(session.access_token);
  } catch (error) {
    if (error instanceof BannedError) await supabase?.auth.signOut();
    throw error;
  }
}

export async function signInAsGuest(name: string, look: Look): Promise<User> {
  const clean = sanitizeName(name);
  if (!clean) throw new Error(NAME_ERROR);
  if (!supabase) throw new Error("Trang chưa cấu hình tài khoản. Hãy đặt VITE_SUPABASE_URL trong .env.");
  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: clean, look } } });
  if (error || !data.session) {
    if (error?.status === 429) throw new Error("Có quá nhiều lượt vào từ mạng này. Hãy thử lại sau ít phút.");
    throw new Error("Chưa vào được rạp lúc này. Hãy thử lại sau ít phút.");
  }
  return exchangeSession(data.session.access_token);
}

export async function signInWithPassword(account: string, password: string): Promise<User> {
  if (!supabase) throw new Error("Trang chưa cấu hình tài khoản. Hãy đặt VITE_SUPABASE_URL trong .env.");
  const cleanAccount = account.trim();
  const email = cleanAccount.includes("@") ? cleanAccount : `${cleanAccount}@admin.com`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("Tài khoản hoặc mật khẩu không đúng.");
  return exchangeSession(data.session.access_token);
}

/** Leaves the page for Google. The app picks the session up in restoreUser when the browser returns. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error("Trang chưa cấu hình tài khoản. Hãy đặt VITE_SUPABASE_URL trong .env.");
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } });
  if (error) throw new Error("Không mở được đăng nhập Google. Hãy thử lại.");
}

// Test sign-ins, which only work while the server has DEV_LOGIN=true.
export const signInForDev = (name: string) => postJson<User>("/api/auth/dev", { name, admin: true });
export const signInAsDevGuest = (name: string, look: Look) => postJson<User>("/api/auth/guest", { name, look });

export async function saveProfile(name: string, look: Look): Promise<User> {
  const clean = sanitizeName(name);
  if (!clean) throw new Error(NAME_ERROR);
  const session = supabase && (await supabase.auth.getSession()).data.session;
  if (!supabase || !session) return postJson<User>("/api/profile", { name: clean, look });
  const { error } = await supabase.from("users").update({ display_name: clean, look }).eq("id", session.user.id);
  if (error) throw new Error("Không lưu được nhân vật. Hãy thử lại.");
  return exchangeSession(session.access_token);
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  await postJson<{ ok: true }>("/api/auth/logout", {});
}
