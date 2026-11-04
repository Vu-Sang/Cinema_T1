import { sanitizeLook, sanitizeName, type Look } from "../shared/look.ts";
import type { User } from "../shared/protocol.ts";
import type { Env } from "./env.ts";

const COOKIE = "t1_session";
const SESSION_DAYS = 30;
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * What the signed cookie holds. It never stores "admin": the role is worked out on every request,
 * so removing an email from ADMIN_EMAILS or turning DEV_LOGIN off takes effect immediately.
 */
export type Session = { id: string; name: string; look: Look; email?: string; devAdmin?: boolean };

export function userFrom(env: Env, session: Session): User {
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase());
  const admin = (session.email !== undefined && admins.includes(session.email.toLowerCase())) || (session.devAdmin === true && env.DEV_LOGIN === "true");
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

export async function sessionCookie(env: Env, session: Session, request: Request): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...session, exp })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env), encoder.encode(payload));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${toBase64Url(new Uint8Array(signature))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`;
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
    email: typeof stored.email === "string" ? stored.email : undefined,
    devAdmin: stored.devAdmin === true,
  };
}

type GoogleClaims = {
  aud: string;
  iss: string;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

/** Returns a session for a valid token, null for a bad or expired one. Network failures reaching Google throw. */
export async function verifyGoogleCredential(env: Env, credential: string): Promise<Session | null> {
  if (!env.GOOGLE_CLIENT_ID) return null;
  const [rawHeader, rawClaims, rawSignature] = credential.split(".");
  if (!rawHeader || !rawClaims || !rawSignature) return null;

  let header: { alg?: string; kid?: string };
  let claims: GoogleClaims;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(rawHeader)));
    claims = JSON.parse(decoder.decode(fromBase64Url(rawClaims)));
    signature = fromBase64Url(rawSignature);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error(`Google certs request failed: ${response.status}`);
  const { keys } = (await response.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, encoder.encode(`${rawHeader}.${rawClaims}`));
  if (!valid) return null;

  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issuerOk || claims.aud !== env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) return null;
  if (!claims.email || claims.email_verified !== true) return null;

  return {
    id: `google:${claims.sub}`,
    name: sanitizeName(claims.name) ?? sanitizeName(claims.email.split("@")[0]) ?? "Thành viên",
    look: sanitizeLook(undefined),
    email: claims.email,
  };
}
