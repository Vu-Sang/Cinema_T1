import * as THREE from "three";
import { DEFAULT_LOOK, type Look } from "../../shared/look.ts";
import { CAST, type PrankTool } from "../../shared/protocol.ts";
import { Avatar, type Poke } from "./avatar.ts";

const STAGE_TOP = 0.45;
const STAGE_Z = 2.75;
const SPACING = 1.15;
const SCALE = 1.2;
const HEAD_FLIGHT_SECONDS = 0.72;
const HEAD_LIFETIME = 4.2;
const GRAVITY = 14;

const person = (extra: Partial<Look>): Look => ({ ...DEFAULT_LOOK, item: "none", ...extra });

/** The lineup is drawn from the same blocky characters as the audience, dressed in the white T1 jersey. */
const LOOKS: Look[] = [
  person({ outfit: "jacket", glasses: true, hairColor: 1 }), // Tom, the coach
  person({ hairColor: 0 }), // Doran
  person({ hairColor: 2 }), // Oner
  person({ outfit: "gold", headwear: "crown" }), // Faker
  person({ hairStyle: "spiky", hairColor: 4 }), // Peyz
  person({ hairStyle: "long", hairColor: 3, outfit: "red" }), // Keria
];

/** What each of them says when poked. Keys are the tools; the last line is for the Ati head. */
const QUIPS: Record<string, Record<PrankTool, string[]>> = {
  Tom: {
    punch: ["Ê ê, đánh HLV là bị phạt đó!", "Đau quá, ván sau không draft cho ai nữa đâu!"],
    throw: ["Ai ném cái gì vào đầu thầy vậy?!", "Linh vật cũng biết ném thầy..."],
    tickle: ["Thầy nhột, đừng mà!", "Ha ha ha, họp team thôi, dừng lại!"],
  },
  Doran: {
    punch: ["Đánh top laner hả, tank là nghề của anh!", "Ui! Em đang lên đồ mà!"],
    throw: ["Cái gì mềm mềm vậy?", "Ơ, linh vật bay vào mặt em!"],
    tickle: ["Ha ha, nhột nhột!", "Đừng cù, em đang cười không nhịn được!"],
  },
  Oner: {
    punch: ["Rừng này không cho đánh nha!", "Ui, bị gank rồi!"],
    throw: ["Ủa, Ati bay tới gank hả?", "Bonk! Em chưa kịp ward!"],
    tickle: ["Hi hi, đừng cù đường rừng!", "Nhột quá, em đi gank đây!"],
  },
  Faker: {
    punch: ["Đánh Faker hả? Chưa tới ván 5 đâu!", "Quỷ vương bất tử, đau cũng không nói."],
    throw: ["Cái đầu này… quen quen.", "Faker né được, nhưng đầu Ati nhanh hơn."],
    tickle: ["Hmm… (cố nhịn cười)", "Quỷ vương cũng biết nhột đó nha."],
  },
  Peyz: {
    punch: ["Ái! Em là xạ thủ mà!", "Ui da, tay em còn phải bấm chuột!"],
    throw: ["Headshot! À nhầm, bị headshot!", "Đầu Ati trúng đầu em luôn!"],
    tickle: ["Ha ha ha, đừng làm em lệch tay!", "Nhột, nhột quá!"],
  },
  Keria: {
    punch: ["Đánh support hả, ai heal cho cả team đây!", "Ui, Keria đau thiệt!"],
    throw: ["Ô, em tưởng là Thresh hook!", "Ati ơi, anh ôm lại được không?"],
    tickle: ["Hi hi hi! Dừng, em còn phải mở bình oxy!", "Cười chết em rồi!"],
  },
};

type Member = {
  name: string;
  avatar: Avatar;
  pivot: THREE.Group;
  hit: THREE.Mesh;
  /** Spring that tips them over backwards when hit and brings them upright again. */
  tilt: number;
  tiltSpeed: number;
  roll: number;
  rollSpeed: number;
  hop: number;
  hopSpeed: number;
};

type Flyer = {
  sprite: THREE.Sprite;
  age: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: number;
  velocity: THREE.Vector3 | null;
  spin: number;
  landed: number;
};

type Burst = { sprite: THREE.Sprite; age: number };

function wordTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.translate(128, 64);
  context.rotate(-0.12);
  context.font = "900 62px 'Be Vietnam Pro', Impact, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 14;
  context.strokeStyle = "#14070b";
  context.strokeText(text, 0, 0);
  context.fillStyle = color;
  context.fillText(text, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** World-space corners of the lineup, so the camera leaves room for it above the seats. */
export const CAST_BOUNDS: THREE.Vector3[] = [
  new THREE.Vector3(-3.6, STAGE_TOP + 2.4, STAGE_Z),
  new THREE.Vector3(3.6, STAGE_TOP + 2.4, STAGE_Z),
];

/** Tom and the five players on the stage, and the fun viewers can have with them. */
export class Cast {
  readonly hitMeshes: THREE.Mesh[] = [];
  private readonly members: Member[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly bursts: Burst[] = [];
  private readonly headTexture: THREE.Texture;
  private readonly words = new Map<string, THREE.CanvasTexture>();
  private nextIdle = 3;
  private clock = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.headTexture = new THREE.TextureLoader().load("/brand/ati/head.webp");
    this.headTexture.colorSpace = THREE.SRGBColorSpace;
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

    CAST.forEach((name, index) => {
      const x = (index - (CAST.length - 1) / 2) * SPACING;
      const avatar = new Avatar(`cast:${name}`, name, LOOKS[index], { x: 0, y: 0, z: 0, row: 0, column: 0 });
      avatar.display = "standing";
      avatar.face(Math.PI);
      avatar.update(5);

      const pivot = new THREE.Group();
      pivot.position.set(x, STAGE_TOP, STAGE_Z);
      pivot.scale.setScalar(SCALE);
      pivot.add(avatar.root);

      // An invisible, generous box around each one: small figures far from the camera are hard to hit otherwise.
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.8), hitMaterial);
      hit.position.y = 0.95;
      hit.userData.cast = index;
      pivot.add(hit);
      this.hitMeshes.push(hit);

      scene.add(pivot);
      this.members.push({ name, avatar, pivot, hit, tilt: 0, tiltSpeed: 0, roll: 0, rollSpeed: 0, hop: 0, hopSpeed: 0 });
    });
  }

  nameOf(index: number): string {
    return this.members[index]?.name ?? "";
  }

  /** World position of the top of someone's head. */
  headAt(index: number, target: THREE.Vector3): THREE.Vector3 {
    const member = this.members[index];
    if (!member) return target.set(0, 0, 0);
    return member.avatar.headPosition(target);
  }

  /** The line someone says after being poked, picked at random. */
  quip(index: number, tool: PrankTool): string {
    const lines = QUIPS[CAST[index]]?.[tool] ?? ["Ê!"];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /** `from` is where the Ati head starts its flight; without it the head comes from the back of the house. */
  poke(tool: PrankTool, index: number, from: THREE.Vector3 | null): void {
    const member = this.members[index];
    if (!member) return;
    const impact = this.headAt(index, new THREE.Vector3());
    impact.y -= 0.35;
    impact.z += 0.35;

    if (tool === "throw") {
      const start = from ? from.clone() : new THREE.Vector3((Math.random() - 0.5) * 4, 1.4, 9);
      this.launchHead(start, impact, index);
      return;
    }
    if (tool === "punch") this.hit(index, "punch", impact);
    else this.tickle(index, impact);
  }

  private hit(index: number, kind: Poke, impact: THREE.Vector3): void {
    const member = this.members[index];
    if (kind === "punch") {
      member.tiltSpeed = -7;
      member.hopSpeed = 3.2;
      member.rollSpeed = (Math.random() - 0.5) * 6;
      this.burst(impact, "BỐP!", "#ffd36b");
    } else {
      member.tiltSpeed = -3.2;
      member.rollSpeed = (Math.random() - 0.5) * 8;
      member.hopSpeed = 1.5;
      this.burst(impact, "BONK!", "#ff6b81");
    }
    member.avatar.poke(kind);
  }

  private tickle(index: number, impact: THREE.Vector3): void {
    const member = this.members[index];
    member.hopSpeed = 1.6;
    member.avatar.poke("tickle");
    this.burst(impact, "HAHA!", "#8fe3ff");
  }

  private burst(at: THREE.Vector3, text: string, color: string): void {
    const key = `${text}${color}`;
    let texture = this.words.get(key);
    if (!texture) {
      texture = wordTexture(text, color);
      this.words.set(key, texture);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.copy(at);
    sprite.scale.set(1.5, 0.75, 1);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.bursts.push({ sprite, age: 0 });
  }

  private launchHead(from: THREE.Vector3, to: THREE.Vector3, target: number): void {
    const material = new THREE.SpriteMaterial({ map: this.headTexture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.82, 0.58, 1);
    sprite.position.copy(from);
    sprite.renderOrder = 9;
    this.scene.add(sprite);
    this.flyers.push({ sprite, age: 0, from, to, target, velocity: null, spin: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 4), landed: 0 });
  }

  update(dt: number): void {
    this.clock += dt;

    // Every few seconds one of them livens up on their own, so the lineup never looks frozen.
    this.nextIdle -= dt;
    if (this.nextIdle <= 0) {
      this.nextIdle = 5 + Math.random() * 6;
      const member = this.members[Math.floor(Math.random() * this.members.length)];
      member.avatar.play(Math.random() < 0.6 ? "dance" : "jump");
    }

    for (const member of this.members) {
      member.tiltSpeed += (-60 * member.tilt - 7 * member.tiltSpeed) * dt;
      member.tilt += member.tiltSpeed * dt;
      member.rollSpeed += (-55 * member.roll - 6 * member.rollSpeed) * dt;
      member.roll += member.rollSpeed * dt;
      member.hopSpeed -= 22 * dt;
      member.hop = Math.max(0, member.hop + member.hopSpeed * dt);
      if (member.hop === 0 && member.hopSpeed < 0) member.hopSpeed = 0;
      member.pivot.rotation.x = member.tilt;
      member.pivot.rotation.z = member.roll;
      member.pivot.position.y = STAGE_TOP + member.hop;
      member.avatar.update(dt);
    }

    for (let index = this.flyers.length - 1; index >= 0; index--) {
      const flyer = this.flyers[index];
      flyer.age += dt;
      flyer.sprite.material.rotation += flyer.spin * dt;
      if (!flyer.velocity) {
        const t = Math.min(flyer.age / HEAD_FLIGHT_SECONDS, 1);
        flyer.sprite.position.lerpVectors(flyer.from, flyer.to, t);
        flyer.sprite.position.y += Math.sin(t * Math.PI) * 1.8;
        if (t >= 1) {
          // Arrived: the head bonks them and bounces off toward the audience.
          this.hit(flyer.target, "bonk", flyer.to);
          flyer.velocity = new THREE.Vector3((Math.random() - 0.5) * 3.2, 4.2, 3.2);
          flyer.landed = 0;
          flyer.age = 0;
        }
      } else {
        flyer.velocity.y -= GRAVITY * dt;
        flyer.sprite.position.addScaledVector(flyer.velocity, dt);
        const floor = flyer.sprite.position.z < 3.2 ? STAGE_TOP : 0;
        const rest = floor + 0.28;
        if (flyer.sprite.position.y < rest && flyer.velocity.y < 0) {
          flyer.sprite.position.y = rest;
          flyer.velocity.y *= -0.5;
          flyer.velocity.x *= 0.7;
          flyer.velocity.z *= 0.6;
          flyer.spin *= 0.6;
          flyer.landed += 1;
        }
        const fade = Math.min(1, Math.max(0, (HEAD_LIFETIME - flyer.age) / 0.6));
        flyer.sprite.material.opacity = fade;
        if (flyer.age > HEAD_LIFETIME) {
          this.scene.remove(flyer.sprite);
          flyer.sprite.material.dispose();
          this.flyers.splice(index, 1);
        }
      }
    }

    for (let index = this.bursts.length - 1; index >= 0; index--) {
      const burst = this.bursts[index];
      burst.age += dt;
      const t = burst.age / 0.9;
      burst.sprite.position.y += dt * 0.9;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - (t - 0.15) * 0.2;
      burst.sprite.scale.set(1.5 * pop, 0.75 * pop, 1);
      burst.sprite.material.opacity = Math.max(0, 1 - Math.max(0, t - 0.55) / 0.45);
      if (t >= 1) {
        this.scene.remove(burst.sprite);
        burst.sprite.material.dispose();
        this.bursts.splice(index, 1);
      }
    }
  }

  dispose(): void {
    for (const flyer of this.flyers) {
      this.scene.remove(flyer.sprite);
      flyer.sprite.material.dispose();
    }
    for (const burst of this.bursts) {
      this.scene.remove(burst.sprite);
      burst.sprite.material.dispose();
    }
    this.flyers.length = 0;
    this.bursts.length = 0;
    for (const member of this.members) {
      this.scene.remove(member.pivot);
      member.avatar.dispose();
    }
    this.members.length = 0;
    this.headTexture.dispose();
    for (const texture of this.words.values()) texture.dispose();
  }
}
