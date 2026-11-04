import * as THREE from "three";
import { HAIR_COLORS, SKIN_COLORS, type Look } from "../../shared/look.ts";
import type { ActionKind } from "../../shared/protocol.ts";
import { floorHeight, OXYGEN_STATIONS, SIDE_AISLE_X, type SeatPlace } from "./hall.ts";

const T1_RED = 0xe2012d;
const BLACK = 0x15151b;
const WHITE = 0xf1f0ec;
const GOLD = 0xd9ad4f;
const TROUSERS = 0x1b1b22;

const THIGH = 0.3;
const SHIN = 0.3;
const STAND_HIP = THIGH + SHIN + 0.04;
const STAND_FORWARD = 0.42;
const CRAWL_SPEED = 1.5;
const WALK_SPEED = 2.2;
const BREATHE_SECONDS = 5;
const POSE_SMOOTHING = 11;

const SKIN = "skin";
type Paint = number | typeof SKIN;

type OutfitStyle = {
  /** Plain colour, or bands of colour wrapped around the body. */
  body: number | { bands: string[]; vertical?: boolean };
  yoke: number;
  sleeveL: Paint;
  sleeveR: Paint;
  forearm: Paint;
  cuff: number;
  hand: Paint;
  print: string;
  logo: "red" | "white" | null;
  extra?: "ringmaster";
};

const OUTFIT_STYLES: Record<Look["outfit"], OutfitStyle> = {
  home: { body: WHITE, yoke: T1_RED, sleeveL: WHITE, sleeveR: WHITE, forearm: SKIN, cuff: T1_RED, hand: SKIN, print: "#8e0520", logo: "red" },
  jacket: { body: BLACK, yoke: T1_RED, sleeveL: BLACK, sleeveR: BLACK, forearm: BLACK, cuff: WHITE, hand: SKIN, print: "#ffffff", logo: "red" },
  red: { body: T1_RED, yoke: BLACK, sleeveL: T1_RED, sleeveR: T1_RED, forearm: SKIN, cuff: BLACK, hand: SKIN, print: "#ffffff", logo: "white" },
  gold: { body: 0xf3e4bd, yoke: GOLD, sleeveL: 0xf3e4bd, sleeveR: 0xf3e4bd, forearm: SKIN, cuff: GOLD, hand: SKIN, print: "#6a4a12", logo: "red" },
  clown: {
    body: { bands: ["#e2012d", "#f6c21c", "#1fa14a", "#1f6fd6"], vertical: true },
    yoke: 0xffffff,
    sleeveL: 0xf6c21c,
    sleeveR: 0x1fa14a,
    forearm: 0xe2012d,
    cuff: 0x1f6fd6,
    hand: 0xffffff,
    print: "#111111",
    logo: null,
  },
  acrobat: { body: 0x1f3a6e, yoke: GOLD, sleeveL: SKIN, sleeveR: SKIN, forearm: SKIN, cuff: GOLD, hand: SKIN, print: "#ffd36b", logo: null },
  ringmaster: { body: BLACK, yoke: 0xffffff, sleeveL: BLACK, sleeveR: BLACK, forearm: BLACK, cuff: T1_RED, hand: 0xffffff, print: "#ffffff", logo: null, extra: "ringmaster" },
  strongman: { body: { bands: ["#111111", "#f1f0ec"] }, yoke: 0x111111, sleeveL: SKIN, sleeveR: SKIN, forearm: SKIN, cuff: GOLD, hand: SKIN, print: "#e2012d", logo: null },
  mime: { body: { bands: ["#111111", "#f1f0ec"] }, yoke: 0xf1f0ec, sleeveL: 0x111111, sleeveR: 0x111111, forearm: 0x111111, cuff: 0xffffff, hand: 0xffffff, print: "#e2012d", logo: null },
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: number | string): THREE.MeshStandardMaterial {
  const key = String(color);
  let found = materials.get(key);
  if (!found) {
    found = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
    materials.set(key, found);
  }
  return found;
}

function bandMaterial(bands: string[], vertical: boolean): THREE.MeshStandardMaterial {
  const key = `bands:${bands.join()}:${vertical}`;
  let found = materials.get(key);
  if (!found) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const repeat = vertical ? 2 : 4;
    const count = bands.length * repeat;
    for (let index = 0; index < count; index++) {
      context.fillStyle = bands[index % bands.length];
      if (vertical) context.fillRect((index / count) * 64, 0, 64 / count + 1, 64);
      else context.fillRect(0, (index / count) * 64, 64, 64 / count + 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    found = new THREE.MeshStandardMaterial({ map: texture, flatShading: true, roughness: 0.85 });
    materials.set(key, found);
  }
  return found;
}

const textureLoader = new THREE.TextureLoader();
const logoTextures: Partial<Record<"red" | "white", THREE.Texture>> = {};
function logoTexture(color: "red" | "white"): THREE.Texture {
  logoTextures[color] ??= textureLoader.load(color === "red" ? "/brand/t1-logo.svg" : "/brand/t1-logo-white.svg", (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
  });
  return logoTextures[color]!;
}

const decalMaterials = new Map<string, THREE.MeshBasicMaterial>();
function decal(color: "red" | "white"): THREE.MeshBasicMaterial {
  let found = decalMaterials.get(color);
  if (!found) {
    found = new THREE.MeshBasicMaterial({ map: logoTexture(color), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    decalMaterials.set(color, found);
  }
  return found;
}

// Lightsticks are drawn with their own glow so a dark house fills with red points without any real lights.
const lightstickGlow = new THREE.SpriteMaterial({
  color: 0xff3355,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.35,
});
const lightstickHead = new THREE.MeshStandardMaterial({ color: 0xff1a47, emissive: 0xe2012d, emissiveIntensity: 1.1, flatShading: true });
let glowReady = false;

export function setLightstickGlow(level: number): void {
  lightstickGlow.opacity = level;
}

function ensureGlowTexture(): void {
  if (glowReady) return;
  glowReady = true;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  lightstickGlow.map = new THREE.CanvasTexture(canvas);
  lightstickGlow.needsUpdate = true;
}

const geometries = {
  torso: new THREE.CylinderGeometry(0.25, 0.2, 0.54, 8).scale(1, 1, 0.68),
  yoke: new THREE.CylinderGeometry(0.17, 0.26, 0.11, 8).scale(1, 1, 0.7),
  ruffle: new THREE.CylinderGeometry(0.2, 0.33, 0.1, 10).scale(1, 1, 0.8),
  neck: new THREE.CylinderGeometry(0.075, 0.085, 0.08, 6),
  head: new THREE.IcosahedronGeometry(0.255, 1),
  hairCap: new THREE.SphereGeometry(0.272, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56),
  hairLong: new THREE.BoxGeometry(0.42, 0.42, 0.14),
  bun: new THREE.IcosahedronGeometry(0.1, 0),
  spike: new THREE.ConeGeometry(0.075, 0.17, 4),
  eye: new THREE.SphereGeometry(0.03, 6, 5),
  nose: new THREE.IcosahedronGeometry(0.052, 1),
  mouth: new THREE.BoxGeometry(0.11, 0.022, 0.012),
  mustache: new THREE.BoxGeometry(0.17, 0.028, 0.02),
  maskFace: new THREE.SphereGeometry(0.262, 10, 8, Math.PI, Math.PI),
  lens: new THREE.TorusGeometry(0.062, 0.011, 5, 12),
  bridge: new THREE.BoxGeometry(0.05, 0.012, 0.012),
  upperArm: new THREE.CylinderGeometry(0.068, 0.058, 0.25, 6),
  sleeve: new THREE.CylinderGeometry(0.076, 0.07, 0.07, 6),
  forearm: new THREE.CylinderGeometry(0.056, 0.05, 0.23, 6),
  hand: new THREE.IcosahedronGeometry(0.058, 0),
  thigh: new THREE.CylinderGeometry(0.095, 0.08, THIGH, 6),
  shin: new THREE.CylinderGeometry(0.075, 0.06, SHIN, 6),
  shoe: new THREE.BoxGeometry(0.12, 0.08, 0.22),
  mask: new THREE.ConeGeometry(0.095, 0.11, 6),
  marker: new THREE.ConeGeometry(0.1, 0.17, 4),
  capTop: new THREE.SphereGeometry(0.285, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
  capBrim: new THREE.BoxGeometry(0.3, 0.025, 0.22),
  band: new THREE.CylinderGeometry(0.275, 0.275, 0.07, 12),
  crownBase: new THREE.CylinderGeometry(0.2, 0.17, 0.08, 8),
  crownTip: new THREE.ConeGeometry(0.04, 0.1, 4),
  hatCrown: new THREE.CylinderGeometry(0.19, 0.2, 0.34, 12),
  hatBrim: new THREE.CylinderGeometry(0.33, 0.33, 0.025, 14),
  beret: new THREE.SphereGeometry(0.3, 10, 6).scale(1.05, 0.42, 1.05),
  shirtFront: new THREE.PlaneGeometry(0.18, 0.42),
  bow: new THREE.BoxGeometry(0.16, 0.05, 0.02),
  cape: new THREE.BoxGeometry(0.56, 0.68, 0.025),
  logo: new THREE.PlaneGeometry(0.2, 0.08),
  handle: new THREE.CylinderGeometry(0.022, 0.026, 0.2, 6),
  stickHead: new THREE.CylinderGeometry(0.05, 0.04, 0.3, 8),
  stickCap: new THREE.IcosahedronGeometry(0.05, 0),
  pole: new THREE.CylinderGeometry(0.012, 0.012, 0.75, 5),
  flag: new THREE.PlaneGeometry(0.46, 0.28),
  foamHand: new THREE.BoxGeometry(0.2, 0.2, 0.08),
  foamFinger: new THREE.BoxGeometry(0.075, 0.22, 0.075),
  cupBase: new THREE.CylinderGeometry(0.06, 0.08, 0.05, 8),
  cupStem: new THREE.CylinderGeometry(0.02, 0.03, 0.12, 6),
  cupBowl: new THREE.CylinderGeometry(0.1, 0.05, 0.14, 8),
};

function mesh(geometry: THREE.BufferGeometry, paint: THREE.Material | number | string, y = 0): THREE.Mesh {
  const created = new THREE.Mesh(geometry, paint instanceof THREE.Material ? paint : material(paint));
  created.position.y = y;
  return created;
}

/** Name on the back of the outfit, the part of each person the room actually sees. */
function backPrint(name: string, color: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const label = name.toLocaleUpperCase("vi-VN").slice(0, 14);
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${label.length > 9 ? 30 : 44}px "Be Vietnam Pro", sans-serif`;
  context.fillText(label, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  print.position.set(0, 0.36, 0.172);
  return print;
}

type Limb = { upper: THREE.Group; lower: THREE.Group };

function limb(parent: THREE.Object3D, x: number, y: number, upperMesh: THREE.Object3D[], lowerY: number, lowerMesh: THREE.Object3D[]): Limb {
  const upper = new THREE.Group();
  upper.position.set(x, y, 0);
  upper.add(...upperMesh);
  const lower = new THREE.Group();
  lower.position.y = lowerY;
  lower.add(...lowerMesh);
  upper.add(lower);
  parent.add(upper);
  return { upper, lower };
}

function buildItem(item: Look["item"]): THREE.Group | null {
  if (item === "none") return null;
  const group = new THREE.Group();
  group.position.y = -0.24;
  if (item === "lightstick") {
    ensureGlowTexture();
    const head = new THREE.Mesh(geometries.stickHead, lightstickHead);
    head.position.y = -0.3;
    head.rotation.x = Math.PI;
    const cap = new THREE.Mesh(geometries.stickCap, lightstickHead);
    cap.position.y = -0.46;
    const logo = new THREE.Mesh(geometries.logo, decal("white"));
    logo.position.set(0, -0.32, 0);
    logo.scale.setScalar(0.6);
    logo.rotation.z = Math.PI;
    logo.rotation.y = Math.PI / 2;
    const glow = new THREE.Sprite(lightstickGlow);
    glow.position.y = -0.34;
    glow.scale.setScalar(0.85);
    group.add(mesh(geometries.handle, 0x111111, -0.08), head, cap, logo, glow);
  } else if (item === "flag") {
    const pole = mesh(geometries.pole, 0x222222, -0.28);
    const cloth = new THREE.Mesh(geometries.flag, new THREE.MeshStandardMaterial({ color: T1_RED, flatShading: true, side: THREE.DoubleSide }));
    cloth.position.set(0.25, -0.5, 0);
    const logo = new THREE.Mesh(geometries.logo, decal("white"));
    logo.position.set(0.25, -0.5, 0.004);
    logo.scale.setScalar(1.5);
    logo.rotation.z = Math.PI;
    group.add(pole, cloth, logo);
  } else if (item === "foam") {
    const palm = mesh(geometries.foamHand, T1_RED, -0.12);
    const finger = mesh(geometries.foamFinger, T1_RED, -0.31);
    const logo = new THREE.Mesh(geometries.logo, decal("white"));
    logo.position.set(0, -0.12, 0.045);
    logo.rotation.z = Math.PI;
    group.add(palm, finger, logo);
  } else {
    const gold = 0xe7bf60;
    group.add(mesh(geometries.cupBase, gold, -0.03), mesh(geometries.cupStem, gold, -0.1));
    const bowl = mesh(geometries.cupBowl, gold, -0.22);
    bowl.rotation.x = Math.PI;
    group.add(bowl);
  }
  return group;
}

/** Every joint angle in radians. Limbs hang down at 0; a positive x swings them forward. */
type Pose = {
  hip: number;
  forward: number;
  lean: number;
  sway: number;
  head: number;
  armL: [number, number, number];
  armR: [number, number, number];
  legL: [number, number];
  legR: [number, number];
};

const SIT: Pose = {
  hip: 0.1,
  forward: 0,
  lean: 0,
  sway: 0,
  head: 0,
  armL: [0.75, 0.2, 0.8],
  armR: [0.75, -0.2, 0.8],
  legL: [Math.PI / 2, -Math.PI / 2],
  legR: [Math.PI / 2, -Math.PI / 2],
};

const STAND: Pose = {
  hip: STAND_HIP,
  forward: STAND_FORWARD,
  lean: 0,
  sway: 0,
  head: 0,
  armL: [0.05, 0.08, 0.15],
  armR: [0.05, -0.08, 0.15],
  legL: [0, 0],
  legR: [0, 0],
};

const DISPLAY_STAND: Pose = { ...STAND, forward: 0 };

function dancePose(t: number): Pose {
  const beat = t * 7;
  return {
    ...STAND,
    hip: STAND_HIP + Math.abs(Math.sin(beat)) * 0.14,
    sway: Math.sin(beat / 2) * 0.2,
    head: Math.sin(beat) * 0.15,
    armL: [Math.PI - 0.15 + Math.sin(beat) * 0.3, 0.35, 0.25],
    armR: [Math.PI - 0.15 - Math.sin(beat) * 0.3, -0.35, 0.25],
    legL: [Math.max(0, Math.sin(beat)) * 0.45, -Math.max(0, Math.sin(beat)) * 0.7],
    legR: [Math.max(0, -Math.sin(beat)) * 0.45, -Math.max(0, -Math.sin(beat)) * 0.7],
  };
}

function jumpPose(t: number): Pose {
  const phase = (t * 1.6) % 1;
  const lift = Math.sin(phase * Math.PI);
  return {
    ...STAND,
    hip: STAND_HIP + lift * 0.62,
    armL: [lift * (Math.PI - 0.3), 0.25, 0.2],
    armR: [lift * (Math.PI - 0.3), -0.25, 0.2],
    legL: [lift * 0.35, -lift * 0.65],
    legR: [lift * 0.35, -lift * 0.65],
  };
}

function crawlPose(t: number): Pose {
  const step = Math.sin(t * 8);
  return {
    hip: 0.34,
    forward: 0,
    lean: -1.45,
    sway: step * 0.05,
    head: 1.1,
    armL: [Math.PI / 2 + 0.05 + step * 0.42, 0, 0],
    armR: [Math.PI / 2 + 0.05 - step * 0.42, 0, 0],
    legL: [0.25 - step * 0.28, -1.5],
    legR: [0.25 + step * 0.28, -1.5],
  };
}

function walkPose(t: number): Pose {
  const step = Math.sin(t * 9);
  return {
    ...STAND,
    forward: 0,
    armL: [-step * 0.6, 0.05, 0.3],
    armR: [step * 0.6, -0.05, 0.3],
    legL: [step * 0.55, -Math.max(0, -step) * 0.7],
    legR: [-step * 0.55, -Math.max(0, step) * 0.7],
  };
}

function breathePose(t: number): Pose {
  const breath = Math.sin(t * 2.4) * 0.05;
  return {
    hip: 0.1,
    forward: 0,
    lean: -0.32 + breath,
    sway: 0,
    head: 0.22 + breath,
    armL: [0.95, 0.15, 1.6],
    armR: [0.6, -0.12, 0.5],
    legL: [Math.PI / 2 - 0.2, -0.25],
    legR: [Math.PI / 2 - 0.1, -0.5],
  };
}

type Segment =
  | { kind: "travel"; from: THREE.Vector3; to: THREE.Vector3; seconds: number; pose: (t: number) => Pose; heading: number }
  | { kind: "still"; at: THREE.Vector3; seconds: number; pose: (t: number) => Pose; heading: number; mask?: boolean };

const headingToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

function oxygenRoute(place: SeatPlace): Segment[] {
  const seat = new THREE.Vector3(place.x, 0, place.z);
  const station = OXYGEN_STATIONS.reduce((best, candidate) =>
    candidate.distanceToSquared(seat) < best.distanceToSquared(seat) ? candidate : best,
  );
  const side = Math.sign(station.x);
  const rowFront = new THREE.Vector3(place.x, 0, place.z - 0.56);
  const aisleEnd = new THREE.Vector3(side * SIDE_AISLE_X, 0, place.z - 0.56);
  const aisleAtStation = new THREE.Vector3(side * SIDE_AISLE_X, 0, station.z);

  const stops = [seat, rowFront, aisleEnd, aisleAtStation];
  const route: Segment[] = [];
  const travel = (from: THREE.Vector3, to: THREE.Vector3, speed: number, pose: (t: number) => Pose): void => {
    const seconds = from.distanceTo(to) / speed;
    if (seconds > 0.01) route.push({ kind: "travel", from, to, seconds, pose, heading: headingToward(from, to) });
  };
  for (let index = 0; index < stops.length - 1; index++) travel(stops[index], stops[index + 1], CRAWL_SPEED, crawlPose);
  route.push({ kind: "still", at: aisleAtStation, seconds: 0.5, pose: breathePose, heading: side * -Math.PI / 2 });
  route.push({ kind: "still", at: aisleAtStation, seconds: BREATHE_SECONDS, pose: breathePose, heading: side * -Math.PI / 2, mask: true });
  route.push({ kind: "still", at: aisleAtStation, seconds: 0.5, pose: () => STAND, heading: side * -Math.PI / 2 });
  for (let index = stops.length - 1; index > 0; index--) travel(stops[index], stops[index - 1], WALK_SPEED, walkPose);
  return route;
}

function timedPose(kind: ActionKind): { pose: (t: number) => Pose; seconds: number } {
  if (kind === "dance") return { pose: dancePose, seconds: 4.2 };
  if (kind === "jump") return { pose: jumpPose, seconds: 2.5 };
  return { pose: () => STAND, seconds: 3.2 };
}

const smoothAngle = (from: number, to: number, amount: number) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
};

/** Seated in the house by default; the banner and character preview stand people up on a floor instead. */
export type AvatarDisplay = "seated" | "standing" | "breathing";

export class Avatar {
  readonly root = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly oxygenMask: THREE.Mesh;
  private readonly print: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private readonly item: THREE.Group | null;
  private readonly idleSeed: number;
  private place: SeatPlace;
  private timed: { pose: (t: number) => Pose; seconds: number; elapsed: number } | null = null;
  private route: { segments: Segment[]; index: number; elapsed: number } | null = null;
  private clock = 0;
  display: AvatarDisplay = "seated";

  constructor(userId: string, name: string, look: Look, place: SeatPlace) {
    this.place = place;
    let seed = 7;
    for (const char of userId) seed = (Math.imul(seed, 31) + char.codePointAt(0)!) >>> 0;
    this.idleSeed = (seed % 1000) / 100;

    const skin = look.face === "mime" ? "#f7f5f2" : SKIN_COLORS[look.skin];
    const hair = HAIR_COLORS[look.hairColor];
    const style = OUTFIT_STYLES[look.outfit];
    const paint = (value: Paint) => (value === SKIN ? SKIN_COLORS[look.skin] : value);

    const body = typeof style.body === "number" ? material(style.body) : bandMaterial(style.body.bands, style.body.vertical === true);
    const collar = look.outfit === "clown" ? geometries.ruffle : geometries.yoke;
    this.torso.add(mesh(geometries.torso, body, 0.27), mesh(collar, style.yoke, 0.53), mesh(geometries.neck, SKIN_COLORS[look.skin], 0.6));
    if (style.logo) {
      const logo = new THREE.Mesh(geometries.logo, decal(style.logo));
      logo.position.set(0, 0.4, -0.172);
      logo.rotation.y = Math.PI;
      this.torso.add(logo);
    }
    if (style.extra === "ringmaster") {
      const shirt = mesh(geometries.shirtFront, 0xffffff, 0.3);
      shirt.position.z = -0.17;
      shirt.rotation.y = Math.PI;
      const bow = mesh(geometries.bow, 0x111111, 0.5);
      bow.position.z = -0.175;
      const cape = mesh(geometries.cape, T1_RED, 0.22);
      cape.position.z = 0.165;
      this.torso.add(shirt, bow, cape);
    }
    this.print = backPrint(name, style.print);
    this.torso.add(this.print);

    this.head.position.y = 0.62;
    this.head.add(mesh(geometries.head, skin, 0.22));

    if (look.headwear !== "tophat") {
      const cap = mesh(geometries.hairCap, hair, 0.235);
      cap.rotation.x = 0.6;
      this.head.add(cap);
    }
    if (look.hairStyle === "long") {
      const back = mesh(geometries.hairLong, hair, 0.08);
      back.position.z = 0.17;
      this.head.add(back);
    } else if (look.hairStyle === "bun" && look.headwear === "none") {
      const bun = mesh(geometries.bun, hair, 0.46);
      bun.position.z = 0.12;
      this.head.add(bun);
    } else if (look.hairStyle === "spiky" && look.headwear === "none") {
      for (const [x, z] of [[-0.14, 0.05], [0.14, 0.05], [0, 0.12], [-0.07, -0.08], [0.08, -0.08]]) {
        const spike = mesh(geometries.spike, hair, 0.47);
        spike.position.x = x;
        spike.position.z = z;
        spike.rotation.set(z * 2.2, 0, -x * 2.2);
        this.head.add(spike);
      }
    }
    this.buildFace(look);
    this.buildHeadwear(look);

    this.oxygenMask = mesh(geometries.mask, 0x8fd0ff, 0.17);
    this.oxygenMask.rotation.x = -Math.PI / 2;
    this.oxygenMask.position.z = -0.25;
    this.oxygenMask.visible = false;
    this.head.add(this.oxygenMask);
    this.torso.add(this.head);

    const armParts = (sleeve: Paint): [THREE.Object3D[], THREE.Object3D[]] => [
      [mesh(geometries.upperArm, paint(sleeve), -0.125), mesh(geometries.sleeve, style.cuff, -0.225)],
      [mesh(geometries.forearm, paint(style.forearm), -0.115), mesh(geometries.hand, paint(style.hand), -0.24)],
    ];
    const [leftUpper, leftLower] = armParts(style.sleeveL);
    const [rightUpper, rightLower] = armParts(style.sleeveR);
    this.armL = limb(this.torso, -0.29, 0.51, leftUpper, -0.25, leftLower);
    this.armR = limb(this.torso, 0.29, 0.51, rightUpper, -0.25, rightLower);

    this.item = buildItem(look.item);
    if (this.item) this.armR.lower.add(this.item);

    const legParts = (): [THREE.Object3D[], THREE.Object3D[]] => {
      const shoe = mesh(geometries.shoe, 0xf4f4f4, -SHIN - 0.03);
      shoe.position.z = -0.05;
      return [[mesh(geometries.thigh, TROUSERS, -THIGH / 2)], [mesh(geometries.shin, TROUSERS, -SHIN / 2), shoe]];
    };
    const [leftThigh, leftShin] = legParts();
    const [rightThigh, rightShin] = legParts();
    this.legL = limb(this.root, -0.11, 0, leftThigh, -THIGH, leftShin);
    this.legR = limb(this.root, 0.11, 0, rightThigh, -THIGH, rightShin);

    this.root.add(this.torso);

    this.marker = new THREE.Mesh(geometries.marker, new THREE.MeshBasicMaterial({ color: 0xffd36b }));
    this.marker.rotation.x = Math.PI;
    this.marker.position.y = 1.42;
    this.marker.visible = false;
    this.root.add(this.marker);

    this.applyPose(SIT, 1);
    this.root.position.set(place.x, place.y + SIT.hip, place.z);
  }

  private buildFace(look: Look): void {
    const face = new THREE.Group();
    face.position.y = 0.22;
    const onFace = (geometry: THREE.BufferGeometry, color: number, x: number, y: number) => {
      const part = mesh(geometry, color, y);
      part.position.x = x;
      part.position.z = -Math.sqrt(Math.max(0.001, 0.0645 - x * x - y * y));
      face.add(part);
      return part;
    };
    onFace(geometries.eye, 0x111111, -0.09, -0.005);
    onFace(geometries.eye, 0x111111, 0.09, -0.005);
    if (look.face === "clown") {
      onFace(geometries.nose, 0xe2012d, 0, -0.04);
      onFace(geometries.mouth, 0xe2012d, 0, -0.12).scale.set(1.4, 1.6, 1);
    } else if (look.face === "mime") {
      onFace(geometries.mouth, 0x111111, 0, -0.12);
    } else if (look.face === "mustache") {
      onFace(geometries.mustache, 0x15110f, 0, -0.08);
      onFace(geometries.mouth, 0x8a3b32, 0, -0.13);
    } else {
      onFace(geometries.mouth, 0x8a3b32, 0, -0.11).scale.x = 0.7;
    }
    if (look.glasses) {
      const lens = (x: number) => {
        const ring = mesh(geometries.lens, 0x151515, 0.02);
        ring.position.set(x, -0.005, -0.25);
        face.add(ring);
      };
      lens(-0.09);
      lens(0.09);
      const bridge = mesh(geometries.bridge, 0x151515, -0.005);
      bridge.position.z = -0.255;
      face.add(bridge);
    }
    this.head.add(face);
  }

  private buildHeadwear(look: Look): void {
    if (look.headwear === "cap") {
      const top = mesh(geometries.capTop, 0xf6f6f2, 0.28);
      top.rotation.x = 0.1;
      const brim = mesh(geometries.capBrim, 0xf6f6f2, 0.3);
      brim.position.z = -0.32;
      const logo = new THREE.Mesh(geometries.logo, decal("red"));
      logo.position.set(0, 0.42, -0.262);
      logo.rotation.set(0.5, Math.PI, 0);
      logo.scale.setScalar(0.8);
      this.head.add(top, brim, logo);
    } else if (look.headwear === "headband") {
      const logo = new THREE.Mesh(geometries.logo, decal("white"));
      logo.position.set(0, 0.34, -0.28);
      logo.rotation.y = Math.PI;
      logo.scale.setScalar(0.62);
      this.head.add(mesh(geometries.band, T1_RED, 0.34), logo);
    } else if (look.headwear === "crown") {
      this.head.add(mesh(geometries.crownBase, GOLD, 0.5));
      for (let index = 0; index < 5; index++) {
        const angle = (index / 5) * Math.PI * 2;
        const tip = mesh(geometries.crownTip, GOLD, 0.58);
        tip.position.x = Math.cos(angle) * 0.17;
        tip.position.z = Math.sin(angle) * 0.17;
        this.head.add(tip);
      }
    } else if (look.headwear === "tophat") {
      const ribbon = mesh(geometries.band, T1_RED, 0.47);
      ribbon.scale.set(0.74, 0.8, 0.74);
      this.head.add(mesh(geometries.hatBrim, 0x111111, 0.42), mesh(geometries.hatCrown, 0x111111, 0.6), ribbon);
    } else if (look.headwear === "beret") {
      const beret = mesh(geometries.beret, 0x111111, 0.43);
      beret.rotation.z = -0.15;
      this.head.add(beret);
    }
  }

  setMine(mine: boolean): void {
    this.marker.visible = mine;
  }

  /** Moving seat cancels whatever the person was doing. */
  moveTo(place: SeatPlace): void {
    this.place = place;
    this.timed = null;
    this.route = null;
    this.root.rotation.y = 0;
    this.root.position.set(place.x, place.y + SIT.hip, place.z);
    this.oxygenMask.visible = false;
  }

  get busy(): boolean {
    return Boolean(this.timed || this.route);
  }

  play(kind: ActionKind): void {
    if (this.busy) return;
    if (kind === "oxygen") this.route = { segments: oxygenRoute(this.place), index: 0, elapsed: 0 };
    else this.timed = { ...timedPose(kind), elapsed: 0 };
  }

  headPosition(target: THREE.Vector3): THREE.Vector3 {
    this.head.getWorldPosition(target);
    target.y += 0.62;
    return target;
  }

  private restingPose(): Pose {
    const base = this.display === "standing" ? DISPLAY_STAND : this.display === "breathing" ? breathePose(this.clock) : SIT;
    if (!this.item || this.display === "breathing") return base;
    // Whatever someone is holding stays up in the air, swaying a little, out of step with their neighbours.
    const sway = Math.sin(this.clock * 2.2 + this.idleSeed) * 0.22;
    return { ...base, armR: [2.75 + sway, -0.22, 0.15] };
  }

  update(dt: number): void {
    this.clock += dt;
    let pose = this.restingPose();
    let x = this.place.x;
    let z = this.place.z;
    let base = this.place.y;
    let heading = 0;
    let mask = this.display === "breathing";
    let travelling = false;

    if (this.timed) {
      this.timed.elapsed += dt;
      pose = this.timed.pose(this.timed.elapsed);
      if (this.display !== "seated") pose = { ...pose, forward: 0 };
      if (this.timed.elapsed > this.timed.seconds) this.timed = null;
    } else if (this.route) {
      const route = this.route;
      route.elapsed += dt;
      let segment: Segment | undefined = route.segments[route.index];
      while (segment && route.elapsed > segment.seconds) {
        route.elapsed -= segment.seconds;
        route.index += 1;
        segment = route.segments[route.index];
      }
      if (!segment) {
        this.route = null;
      } else {
        travelling = true;
        pose = segment.pose(this.clock);
        heading = segment.heading;
        const at =
          segment.kind === "travel"
            ? new THREE.Vector3().lerpVectors(segment.from, segment.to, route.elapsed / segment.seconds)
            : segment.at;
        x = at.x;
        z = at.z;
        base = floorHeight(at.z);
        mask = segment.kind === "still" && segment.mask === true;
      }
    }

    const amount = 1 - Math.exp(-POSE_SMOOTHING * dt);
    this.applyPose(pose, amount);
    this.oxygenMask.visible = mask;
    if (this.item) this.item.visible = !travelling;

    // Forward offset steps people out of the chair so legs do not pass through it.
    const targetZ = z - pose.forward * Math.cos(heading);
    this.root.position.x += (x - this.root.position.x) * amount;
    this.root.position.z += (targetZ - this.root.position.z) * amount;
    this.root.position.y += (base + pose.hip - this.root.position.y) * amount;
    this.root.rotation.y = smoothAngle(this.root.rotation.y, heading, amount);

    if (!this.busy) {
      // Small, unsynchronised shifts so a full house does not look frozen.
      const idle = this.clock * 0.7 + this.idleSeed;
      this.torso.rotation.z += Math.sin(idle) * 0.012;
      this.head.rotation.y = Math.sin(idle * 0.6) * 0.14;
    } else {
      this.head.rotation.y *= 1 - amount;
    }
    if (this.marker.visible) this.marker.position.y = 1.42 + Math.sin(this.clock * 3) * 0.04;
  }

  private applyPose(pose: Pose, amount: number): void {
    const lerp = THREE.MathUtils.lerp;
    this.torso.rotation.x = lerp(this.torso.rotation.x, pose.lean, amount);
    this.torso.rotation.z = lerp(this.torso.rotation.z, pose.sway, amount);
    this.head.rotation.x = lerp(this.head.rotation.x, pose.head, amount);

    this.armL.upper.rotation.x = lerp(this.armL.upper.rotation.x, pose.armL[0], amount);
    this.armL.upper.rotation.z = lerp(this.armL.upper.rotation.z, -Math.abs(pose.armL[1]), amount);
    this.armL.lower.rotation.x = lerp(this.armL.lower.rotation.x, pose.armL[2], amount);
    this.armR.upper.rotation.x = lerp(this.armR.upper.rotation.x, pose.armR[0], amount);
    this.armR.upper.rotation.z = lerp(this.armR.upper.rotation.z, Math.abs(pose.armR[1]), amount);
    this.armR.lower.rotation.x = lerp(this.armR.lower.rotation.x, pose.armR[2], amount);
    this.legL.upper.rotation.x = lerp(this.legL.upper.rotation.x, pose.legL[0], amount);
    this.legL.lower.rotation.x = lerp(this.legL.lower.rotation.x, pose.legL[1], amount);
    this.legR.upper.rotation.x = lerp(this.legR.upper.rotation.x, pose.legR[0], amount);
    this.legR.lower.rotation.x = lerp(this.legR.lower.rotation.x, pose.legR[1], amount);
  }

  dispose(): void {
    const printMaterial = this.print.material as THREE.MeshBasicMaterial;
    printMaterial.map?.dispose();
    printMaterial.dispose();
    this.print.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
  }
}
