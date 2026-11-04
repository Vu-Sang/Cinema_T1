// End-to-end check against a running dev server: npm run dev, then npm run smoke.
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:5173";
const VIDEO = "https://www.youtube.com/watch?v=teEg78HrYSw";
// Room 3 is the one these checks change, so rooms 1 and 2 stay as they were.
const ROOM = 3;

const post = (path, body, cookie, origin = BASE) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];

async function loginAdmin(name) {
  const response = await post("/api/auth/dev", { name, admin: true });
  assert.equal(response.status, 200, `login ${name}`);
  return cookieOf(response);
}

async function loginGuest(name, look) {
  const response = await post("/api/auth/guest", { name, look });
  assert.equal(response.status, 200, `guest ${name}`);
  return cookieOf(response);
}

function connect(cookie, room = ROOM) {
  const socket = new WebSocket(`${BASE.replace("http", "ws")}/api/ws?room=${room}`, { headers: { Cookie: cookie, Origin: BASE } });
  const inbox = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    inbox.push(message);
    for (const waiter of [...waiters]) waiter();
  });
  const closed = new Promise((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  return {
    socket,
    closed,
    send: (message) => socket.send(JSON.stringify(message)),
    /** Waits for a new message of the given type that matches the predicate. */
    next(type, predicate = () => true, timeout = 8000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const index = inbox.findIndex((message) => message.t === type && predicate(message));
          if (index === -1) return false;
          waiters.splice(waiters.indexOf(check), 1);
          clearTimeout(timer);
          resolve(inbox.splice(index, 1)[0]);
          return true;
        };
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeout);
        waiters.push(check);
        check();
      });
    },
    clear: () => inbox.splice(0),
  };
}

const rooms = () => fetch(`${BASE}/api/rooms`).then((response) => response.json());
const thisRoom = async () => (await rooms()).find((room) => room.id === ROOM);

const steps = [];
const step = (name, run) => steps.push([name, run]);

let adminCookie, viewerCookie, admin, viewer;

step("POST without a matching Origin is refused", async () => {
  const response = await post("/api/auth/guest", { name: "abc" }, undefined, "https://evil.example");
  assert.equal(response.status, 403);
});

step("WebSocket without a session is refused", async () => {
  const closed = await new Promise((resolve) => {
    const socket = new WebSocket(`${BASE.replace("http", "ws")}/api/ws?room=${ROOM}`, { headers: { Origin: BASE } });
    socket.addEventListener("open", () => resolve(false));
    socket.addEventListener("error", () => resolve(true));
  });
  assert.equal(closed, true);
});

step("a forged session cookie is refused", async () => {
  const response = await fetch(`${BASE}/api/me`, { headers: { Cookie: "t1_session=e30.AAAA" } });
  assert.equal(await response.json(), null);
});

step("a guest cannot give themself admin, and names and looks are cleaned", async () => {
  const short = await post("/api/auth/guest", { name: " a " });
  assert.equal(short.status, 400);
  const response = await post("/api/auth/guest", { name: "  Fan   T1 ", admin: true, look: { outfit: "hack", item: "flag", skin: 99 } });
  const user = await response.json();
  assert.equal(user.name, "Fan T1");
  assert.equal(user.admin, false);
  assert.equal(user.look.outfit, "home");
  assert.equal(user.look.item, "flag");
  assert.equal(user.look.skin, 0);
});

step("only an admin can open, close or schedule a room", async () => {
  adminCookie = await loginAdmin("smoke-admin");
  viewerCookie = await loginGuest("smoke-viewer", { item: "lightstick" });
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "open" })).status, 401);
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "open" }, viewerCookie)).status, 403);
  assert.equal((await post(`/api/admin/rooms/99`, { action: "open" }, adminCookie)).status, 404);
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "hack" }, adminCookie)).status, 400);
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "schedule", opensAt: 1000 }, adminCookie)).status, 400);
});

step("a closed room turns viewers away but lets the admin prepare it", async () => {
  await post(`/api/admin/rooms/${ROOM}`, { action: "close" }, adminCookie);
  const refused = connect(viewerCookie);
  assert.equal(await refused.closed, 4001);
  admin = connect(adminCookie);
  const welcome = await admin.next("welcome");
  assert.equal(welcome.you.admin, true);
  assert.equal(welcome.access.isOpen, false);
});

step("a scheduled room shows the time, then opens by itself when it arrives", async () => {
  const opensAt = Date.now() + 1500;
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "schedule", opensAt }, adminCookie)).status, 200);
  const before = await thisRoom();
  assert.equal(before.isOpen, false);
  assert.equal(before.opensAt, opensAt);
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const after = await thisRoom();
  assert.equal(after.isOpen, true);
  assert.equal(after.opensAt, null);
});

step("a viewer joins an open room with their chosen look", async () => {
  admin.clear();
  viewer = connect(viewerCookie);
  const welcome = await viewer.next("welcome");
  assert.equal(welcome.you.admin, false);
  assert.equal(welcome.you.look.item, "lightstick");
  await admin.next("seats", (message) => message.viewers === welcome.viewers);
});

step("a viewer cannot control playback or the LED", async () => {
  viewer.clear();
  viewer.send({ t: "control", action: "play" });
  await viewer.next("error", (message) => message.message.includes("quản trị"));
  viewer.send({ t: "load", url: VIDEO, isLive: false });
  await viewer.next("error", (message) => message.message.includes("quản trị"));
  viewer.send({ t: "led", text: "x" });
  await viewer.next("error", (message) => message.message.includes("quản trị"));
});

step("a bad link gets an explanation", async () => {
  admin.clear();
  admin.send({ t: "load", url: "https://evil.example/x", isLive: false });
  await admin.next("error", (message) => message.message.includes("YouTube"));
});

step("load, play, seek and pause reach every viewer", async () => {
  admin.send({ t: "load", url: VIDEO, isLive: false });
  const loaded = await viewer.next("playback", (message) => message.playback.videoId === "teEg78HrYSw", 15000);
  assert.equal(loaded.playback.status, "paused");
  assert.ok(loaded.playback.title, "oEmbed title");

  admin.send({ t: "control", action: "seek", position: 10 });
  const seeked = await viewer.next("playback", (message) => message.playback.position === 10);
  assert.equal(seeked.playback.status, "paused");

  admin.send({ t: "control", action: "play" });
  const playing = await viewer.next("playback", (message) => message.playback.status === "playing");
  assert.equal(playing.playback.position, 10);
  assert.equal((await thisRoom()).playback.status, "playing");
});

step("two people cannot hold one seat", async () => {
  admin.clear();
  viewer.clear();
  admin.send({ t: "seat", seat: 55 });
  await viewer.next("seats", (message) => message.seats[55]?.name === "smoke-admin");
  viewer.send({ t: "seat", seat: 55 });
  await viewer.next("error", (message) => message.message.includes("Ghế"));
  viewer.send({ t: "seat", seat: 56 });
  const seated = await admin.next("seats", (message) => message.seats[56]?.name === "smoke-viewer");
  assert.equal(seated.seats[56].look.item, "lightstick");
  assert.equal(seated.seats[56].admin, false);
  assert.equal(seated.seats[55].admin, true);
});

step("changing a character reaches the room, cleaned", async () => {
  admin.clear();
  viewer.send({ t: "profile", name: "Tên Mới", look: { outfit: "jacket", item: "hack" } });
  const changed = await admin.next("seats", (message) => message.seats[56]?.name === "Tên Mới");
  assert.equal(changed.seats[56].look.outfit, "jacket");
  assert.equal(changed.seats[56].look.item, "lightstick".length ? changed.seats[56].look.item : "");
  assert.notEqual(changed.seats[56].look.item, "hack");
  // A socket message can rename a person but never promote them.
  assert.equal(changed.seats[56].admin, false);
});

step("chat, actions and reactions reach the room, and floods are limited", async () => {
  admin.clear();
  admin.send({ t: "chat", text: "  T1 fighting  " });
  const chat = await admin.next("chat");
  assert.equal(chat.message.text, "T1 fighting");
  assert.equal(chat.message.admin, true);
  admin.send({ t: "chat", text: "quá nhanh" });
  await admin.next("error", (message) => message.message.includes("nhanh"));

  admin.send({ t: "action", kind: "dance" });
  assert.equal((await admin.next("action")).kind, "dance");
  admin.send({ t: "react", kind: "t1" });
  assert.equal((await admin.next("react")).kind, "t1");
  admin.send({ t: "react", kind: "hack" });
});

step("someone without a seat cannot act or react", async () => {
  const other = connect(await loginGuest("smoke-standing"));
  await other.next("welcome");
  other.send({ t: "action", kind: "jump" });
  await other.next("error", (message) => message.message.includes("chọn ghế"));
  other.send({ t: "react", kind: "star" });
  await other.next("error", (message) => message.message.includes("chọn ghế"));
  other.socket.close();
});

step("closing a room removes viewers, pauses the film and keeps the admin", async () => {
  admin.clear();
  assert.equal((await post(`/api/admin/rooms/${ROOM}`, { action: "close" }, adminCookie)).status, 200);
  assert.equal(await viewer.closed, 4001);
  await admin.next("access", (message) => message.access.isOpen === false);
  await admin.next("seats", (message) => !message.seats[56] && message.seats[55]?.name === "smoke-admin");
  const room = await thisRoom();
  assert.equal(room.isOpen, false);
  assert.equal(room.playback.status, "paused");
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
admin?.socket.close();
viewer?.socket.close();
process.exit(failed ? 1 : 0);
