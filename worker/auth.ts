import { sanitizeLook, sanitizeName, type Look } from "../shared/look.ts";
import type { User } from "../shared/protocol.ts";
import type { Env } from "./env.ts";

const COOKIE = "t1_session";
/** Short, so a role change or ban in Supabase takes effect within this time. Browsers renew it as their token refreshes. */
export const SUPABASE_SESSION_SECONDS = 2 * 3600;
export const DEV_SESSION_SECONDS = 30 * 86_400;
const FALLBACK_NAME = "Khách";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What the signed cookie holds. devAdmin only counts while DEV_LOGIN is on, so test sessions die with it. */
export type Session = { id: string; name: string; look: Look; admin?: boolean; devAdmin?: boolean };

export function userFrom(env: Env, session: Session): User {
  const admin = session.admin === true || (session.devAdmin === true && env.DEV_LOGIN === "true");
  return { id: session.id, name: session.name, look: session.look, admin };
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(env: Env): Promise<CryptoKey> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function sessionCookie(env: Env, session: Session, request: Request, maxAgeSeconds: number): Promise<string> {
  const exp = Date.now() + maxAgeSeconds * 1000;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...session, exp })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env), encoder.encode(payload));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${toBase64Url(new Uint8Array(signature))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function readSession(env: Env, request: Request): Promise<Session | null> {
  const match = request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature) return null;

  const key = await hmacKey(env);
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return null;
  }
  if (!(await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payload)))) return null;

  const stored = JSON.parse(decoder.decode(fromBase64Url(payload)));
  if (typeof stored.exp !== "number" || stored.exp < Date.now()) return null;
  const name = sanitizeName(stored.name);
  if (typeof stored.id !== "string" || !name) return null;
  return {
    id: stored.id,
    name,
    look: sanitizeLook(stored.look),
    admin: stored.admin === true,
    devAdmin: stored.devAdmin === true,
  };
}

export type SupabaseResult = { kind: "ok"; session: Session } | { kind: "invalid" } | { kind: "banned"; until: string | null };

/**
 * Turns a Supabase access token into a site session. Runs when someone signs in or their token refreshes, never
 * per message, so Supabase is not in the path of anything happening inside a room. Reads use the person's own
 * token, so the database's row level security applies here too. Network or database failures throw.
 */
export async function sessionFromSupabase(env: Env, accessToken: string): Promise<SupabaseResult> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase is not configured");
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` };

  const account = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (account.status === 401 || account.status === 403) return { kind: "invalid" };
  if (!account.ok) throw new Error(`Supabase user lookup failed: ${account.status}`);
  const accountData = (await account.json()) as { id: string; email?: string };
  const { id, email } = accountData;

  const now = encodeURIComponent(new Date().toISOString());
  const [profileResponse, bansResponse] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${id}&select=display_name,look,role`, { headers }),
    fetch(`${env.SUPABASE_URL}/rest/v1/bans?user_id=eq.${id}&or=(expires_at.is.null,expires_at.gt.${now})&select=expires_at`, { headers }),
  ]);
  if (!profileResponse.ok) throw new Error(`Supabase profile lookup failed: ${profileResponse.status}`);
  if (!bansResponse.ok) throw new Error(`Supabase ban lookup failed: ${bansResponse.status}`);

  const bans = (await bansResponse.json()) as { expires_at: string | null }[];
  if (bans.length > 0) {
    const permanent = bans.some((ban) => ban.expires_at === null);
    const latest = bans.map((ban) => ban.expires_at ?? "").sort().at(-1) ?? null;
    return { kind: "banned", until: permanent ? null : latest };
  }

  const [profile] = (await profileResponse.json()) as { display_name: string; look: unknown; role: string }[];
  if (!profile) throw new Error(`No profile for user ${id}`);
  const isDefaultAdmin = email?.toLowerCase() === "vudinhsang0403@gmail.com";
  return {
    kind: "ok",
    session: {
      id: `sb:${id}`,
      name: sanitizeName(profile.display_name) ?? FALLBACK_NAME,
      look: sanitizeLook(profile.look),
      admin: profile.role === "admin" || isDefaultAdmin,
    },
  };
}
