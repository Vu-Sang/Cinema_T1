import type { Look } from "../shared/look.ts";
import type { RoomAdminAction, RoomListing, User } from "../shared/protocol.ts";

export type AuthConfig = { googleClientId: string | null; devLogin: boolean };

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
  if (!response.ok) throw new Error(data.error ?? "Không gửi được yêu cầu. Hãy thử lại.");
  return data;
}

export const fetchConfig = () => getJson<AuthConfig>("/api/config");
export const fetchMe = () => getJson<User | null>("/api/me");
export const fetchRooms = () => getJson<RoomListing[]>("/api/rooms");
export const signInAsGuest = (name: string, look: Look) => postJson<User>("/api/auth/guest", { name, look });
export const signInWithGoogle = (credential: string) => postJson<User>("/api/auth/google", { credential });
export const signInForDev = (name: string) => postJson<User>("/api/auth/dev", { name, admin: true });
export const saveProfile = (name: string, look: Look) => postJson<User>("/api/profile", { name, look });
export const signOut = () => postJson<{ ok: true }>("/api/auth/logout", {});
export const changeRoomAccess = (roomId: number, action: RoomAdminAction) => postJson(`/api/admin/rooms/${roomId}`, action);
