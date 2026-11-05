// Checks the database permissions against the real Supabase project: npm run dev, then npm run test:supabase.
// Creates two anonymous test accounts each run. They can be deleted in Supabase under Authentication > Users.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SITE = process.env.BASE ?? "http://localhost:5173";

async function anonymous(name) {
  const response = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { display_name: name, look: { outfit: "clown" } } }),
  });
  assert.equal(response.status, 200, `anonymous sign-in: ${await response.clone().text()}`);
  const { access_token: token, user } = await response.json();
  return { token, id: user.id };
}

const rest = (token, path, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
const myProfile = async (person) => (await (await rest(person.token, `profiles?id=eq.${person.id}&select=*`)).json())[0];
const session = (accessToken, origin = SITE) =>
  fetch(`${SITE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ accessToken }) });

const steps = [];
const step = (name, run) => steps.push([name, run]);
let a, b;

step("signing in creates a viewer profile with the chosen name and look", async () => {
  a = await anonymous("Thử Quyền A");
  b = await anonymous("Thử Quyền B");
  const profile = await myProfile(a);
  assert.equal(profile.display_name, "Thử Quyền A");
  assert.equal(profile.role, "viewer");
  assert.equal(profile.look.outfit, "clown");
});

step("nobody can read the database without signing in", async () => {
  const response = await fetch(`${URL_BASE}/rest/v1/profiles?select=*`, { headers: { apikey: KEY } });
  assert.ok(response.status === 401 || response.status === 403, `got ${response.status}`);
});

step("a user cannot make themself admin", async () => {
  const response = await rest(a.token, `profiles?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  assert.ok(response.status >= 400, `got ${response.status}`);
  assert.equal((await myProfile(a)).role, "viewer");
});

step("a user can change their own name and look, within the limits", async () => {
  const ok = await rest(a.token, `profiles?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ display_name: "Tên Mới", look: { outfit: "mime" } }) });
  assert.equal(ok.status, 200);
  const long = await rest(a.token, `profiles?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ display_name: "x".repeat(21) }) });
  assert.ok(long.status >= 400, `got ${long.status}`);
  assert.equal((await myProfile(a)).display_name, "Tên Mới");
});

step("a user cannot read or change someone else's profile", async () => {
  const read = await (await rest(a.token, `profiles?id=eq.${b.id}&select=*`)).json();
  assert.deepEqual(read, []);
  const write = await rest(a.token, `profiles?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ display_name: "Bị Sửa" }) });
  assert.deepEqual(await write.json(), []);
  assert.equal((await myProfile(b)).display_name, "Thử Quyền B");
});

step("a viewer cannot ban anyone or remove a profile", async () => {
  const ban = await rest(a.token, "bans", { method: "POST", body: JSON.stringify({ user_id: b.id }) });
  assert.ok(ban.status >= 400, `got ${ban.status}`);
  const remove = await rest(a.token, `profiles?id=eq.${a.id}`, { method: "DELETE" });
  assert.ok(remove.status >= 400, `got ${remove.status}`);
});

step("the site accepts a real token and reads the role from the database", async () => {
  const response = await session(a.token);
  assert.equal(response.status, 200, await response.clone().text());
  const user = await response.json();
  assert.equal(user.id, `sb:${a.id}`);
  assert.equal(user.name, "Tên Mới");
  assert.equal(user.admin, false);
  assert.equal(user.look.outfit, "mime");
});

step("the site's cookie opens a room's API but not its admin actions", async () => {
  const cookie = (await session(a.token)).headers.get("set-cookie").split(";")[0];
  const me = await (await fetch(`${SITE}/api/me`, { headers: { Cookie: cookie } })).json();
  assert.equal(me.id, `sb:${a.id}`);
  const admin = await fetch(`${SITE}/api/admin/rooms/3`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE, Cookie: cookie },
    body: JSON.stringify({ action: "open" }),
  });
  assert.equal(admin.status, 403);
});

step("the site refuses a forged token and another site's request", async () => {
  assert.equal((await session("not-a-token")).status, 401);
  assert.equal((await session(a.token, "https://evil.example")).status, 403);
});

let failed = 0;
for (const [name, run] of steps) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
