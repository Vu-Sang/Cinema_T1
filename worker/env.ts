export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  ADMIN_EMAILS?: string;
  DEV_LOGIN?: string;
}
