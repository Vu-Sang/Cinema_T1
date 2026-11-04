// Fills a local room with test viewers so the theatre can be seen full:
//   npm run dev, then npm run crowd        (26 viewers in room 1 until stopped)
//   COUNT=80 ROOM=2 npm run crowd          (a different size or room)
// Opens the room first, which needs DEV_LOGIN=true in .dev.vars.
const BASE = process.env.BASE ?? "http://localhost:5173";
const COUNT = Number(process.env.COUNT ?? 26);
const ROOM = Number(process.env.ROOM ?? 1);
const NAMES = ["Zeus", "Oner", "Faker", "Gumayusi", "Keria", "Doran", "Peyz", "Smash", "Poby", "Teddy", "Bang", "Wolf"];
const LINES = ["T1 Fighting!", "Faker đỉnh quá", "Bình ôxy đâu rồi", "Ván này thắng chắc", "Hít thở đều nào", "Không blame nhé"];
const ACTIONS = ["dance", "jump", "stand", "oxygen"];
const REACTIONS = ["t1", "star", "cup", "heart", "flame", "gg"];
const OUTFITS = ["home", "home", "jacket", "red", "gold"];
const HAIR_STYLES = ["short", "long", "bun", "spiky"];
const HEADWEAR = ["none", "none", "none", "cap", "headband", "crown"];
const ITEMS = ["lightstick", "lightstick", "lightstick", "none", "flag", "foam", "cup"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const seats = Array.from({ length: 100 }, (_, index) => index + 1).sort(() => Math.random() - 0.5);

const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

const admin = await post("/api/auth/dev", { name: "Crowd Admin", admin: true });
if (!admin.ok) throw new Error(`Admin login failed (${admin.status}). Is DEV_LOGIN=true set in .dev.vars?`);
await post(`/api/admin/rooms/${ROOM}`, { action: "open" }, admin.headers.get("set-cookie").split(";")[0]);

async function join(index) {
  const look = {
    skin: Math.floor(Math.random() * 4),
    hairColor: Math.floor(Math.random() * 6),
    hairStyle: pick(HAIR_STYLES),
    outfit: pick(OUTFITS),
    headwear: pick(HEADWEAR),
    item: pick(ITEMS),
    glasses: Math.random() < 0.3,
  };
  const response = await post("/api/auth/guest", { name: `${NAMES[index % NAMES.length]} ${index + 1}`, look });
  if (!response.ok) throw new Error(`Guest login failed (${response.status}).`);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const socket = new WebSocket(`${BASE.replace("http", "ws")}/api/ws?room=${ROOM}`, { headers: { Cookie: cookie, Origin: BASE } });
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ t: "seat", seat: seats[index] }));
    setInterval(() => socket.send(JSON.stringify({ t: "ping", c: Date.now() })), 20_000);
    setInterval(() => {
      if (Math.random() < 0.15) socket.send(JSON.stringify({ t: "action", kind: pick(ACTIONS) }));
      if (Math.random() < 0.06) socket.send(JSON.stringify({ t: "chat", text: pick(LINES) }));
      if (Math.random() < 0.3) socket.send(JSON.stringify({ t: "react", kind: pick(REACTIONS) }));
    }, 5000 + Math.random() * 6000);
  });
}

for (let index = 0; index < COUNT; index++) await join(index);
console.log(`${COUNT} viewers seated in room ${ROOM}. Press Ctrl+C to clear the room.`);
