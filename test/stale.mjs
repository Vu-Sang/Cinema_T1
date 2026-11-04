// Takes about three minutes, so it is separate from npm run smoke. Needs npm run dev running.
// A viewer who stops pinging must lose the seat, while one who keeps pinging must not.
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:5173";
const ROOM = 3;

const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];

const adminCookie = cookieOf(await post("/api/auth/dev", { name: "stale-admin", admin: true }));
await post(`/api/admin/rooms/${ROOM}`, { action: "open" }, adminCookie);

function join(cookie, seat) {
  const socket = new WebSocket(`${BASE.replace("http", "ws")}/api/ws?room=${ROOM}`, { headers: { Cookie: cookie, Origin: BASE } });
  const state = { seats: {}, closeCode: null };
  socket.addEventListener("open", () => socket.send(JSON.stringify({ t: "seat", seat })));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.seats) state.seats = message.seats;
  });
  socket.addEventListener("close", (event) => {
    state.closeCode = event.code;
  });
  return { socket, state };
}

const silent = join(cookieOf(await post("/api/auth/guest", { name: "im lặng" })), 91);
const alive = join(cookieOf(await post("/api/auth/guest", { name: "còn sống" })), 92);
const pinger = setInterval(() => alive.socket.send(JSON.stringify({ t: "ping", c: Date.now() })), 20_000);

await new Promise((resolve) => setTimeout(resolve, 1500));
assert.ok(alive.state.seats[91] && alive.state.seats[92], "both are seated");

await new Promise((resolve) => setTimeout(resolve, 175_000));
assert.equal(silent.state.closeCode, 4002, "the silent viewer is dropped");
assert.equal(alive.state.closeCode, null, "the pinging viewer stays");
assert.equal(alive.state.seats[91], undefined, "the silent viewer's seat is free");
assert.ok(alive.state.seats[92], "the pinging viewer keeps their seat");

clearInterval(pinger);
alive.socket.close();
await post(`/api/admin/rooms/${ROOM}`, { action: "close" }, adminCookie);
console.log("ok   a dead connection frees its seat, a live one stays");
process.exit(0);
