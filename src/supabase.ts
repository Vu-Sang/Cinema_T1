import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Null when the project has no .env yet: the site then offers only the local test sign-in. */
export const supabase = url && key ? createClient(url, key, { auth: { flowType: "pkce" } }) : null;

export type AuthProviders = { anonymous: boolean; google: boolean };

/** Which sign-in methods the Supabase project has switched on. */
export async function fetchAuthProviders(): Promise<AuthProviders> {
  if (!url || !key) return { anonymous: false, google: false };
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!response.ok) throw new Error(`Auth settings: ${response.status}`);
  const { external } = (await response.json()) as { external: Record<string, boolean> };
  return { anonymous: external.anonymous_users === true, google: external.google === true };
}
