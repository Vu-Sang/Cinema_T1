export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  DEV_LOGIN?: string;
}
