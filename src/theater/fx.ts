import * as THREE from "three";
import type { ActionKind } from "../../shared/protocol.ts";
import type { Avatar } from "./avatar.ts";
import { floorHeight, tankNozzlePosition } from "./hall.ts";

type Particle = {
  object: THREE.Object3D;
  material: THREE.Material & { opacity: number };
  age: number;
  life: number;
  velocity: THREE.Vector3;
  base: number;
  grow: number;
  spin: number;
  sway: number;
  swayPhase: number;
  origin: number;
  shape: "sprite" | "ring";
  ringTo: number;
};

type Emitter = {
  avatar: Avatar;
  kind: ActionKind;
  age: number;
  duration: number;
  clock: number;
  clock2: number;
  step: number;
  disc: THREE.Mesh | null;
  beam: THREE.Mesh | null;
  rig: OxygenRig | null;
};

/** The tube from the tank on the aisle to the mask. */
type OxygenRig = { hose: THREE.Mesh; reach: number };

const NOTE_COLORS = ["#ffd36b", "#ff5d7a", "#8fe3ff", "#ffffff"];

function glyphTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.font = "700 74px 'Be Vietnam Pro', 'Segoe UI Symbol', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 9;
  context.strokeStyle = "rgba(20,7,11,0.85)";
  context.strokeText(text, 48, 52);
  context.fillStyle = color;
  context.fillText(text, 48, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function softTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function bubbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;

  const gradient = context.createRadialGradient(32, 32, 10, 32, 32, 30);
  gradient.addColorStop(0, "rgba(200, 240, 255, 0.12)");
  gradient.addColorStop(0.7, "rgba(140, 220, 255, 0.45)");
  gradient.addColorStop(0.9, "rgba(225, 248, 255, 0.85)");
  gradient.addColorStop(1, "rgba(140, 220, 255, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(32, 32, 30, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.beginPath();
  context.ellipse(23, 21, 6, 3, -Math.PI / 4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255, 255, 255, 0.45)";
  context.beginPath();
  context.arc(39, 41, 2.5, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Little 3D effects that make each action in the hall look different: music notes and a disco floor for a dance,
 * shockwaves for a jump, a beam of light for standing up, bubbles for the oxygen tank. */
export class Fx {
  private readonly particles: Particle[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly ringGeometry = new THREE.RingGeometry(0.42, 0.5, 48);
  private readonly discGeometry = new THREE.CircleGeometry(1, 40);
  private readonly beamGeometry = new THREE.CylinderGeometry(0.7, 0.95, 5, 24, 1, true);
  private readonly logos: { sprite: THREE.Sprite; avatar: Avatar; age: number; life: number }[] = [];
  private logoTexture: THREE.CanvasTexture | null = null;
  private readonly feet = new THREE.Vector3();
  private readonly head = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  private texture(key: string, make: () => THREE.Texture): THREE.Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      texture = make();
      this.textures.set(key, texture);
    }
    return texture;
  }

  private glyph(text: string, color: string): THREE.Texture {
    return this.texture(`${text}${color}`, () => glyphTexture(text, color));
  }

  private floorOf(avatar: Avatar, target: THREE.Vector3): THREE.Vector3 {
    const position = avatar.root.position;
    return target.set(position.x, floorHeight(position.z) + 0.06, position.z);
  }

  private spawnSprite(texture: THREE.Texture, at: THREE.Vector3, options: Partial<Particle> & { size: number; additive?: boolean }): void {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(at);
    sprite.scale.setScalar(options.size);
    sprite.renderOrder = 8;
    this.scene.add(sprite);
    this.particles.push({
      object: sprite,
      material,
      age: 0,
      life: options.life ?? 1.2,
      velocity: options.velocity ?? new THREE.Vector3(),
      base: options.size,
      grow: options.grow ?? 0,
      spin: options.spin ?? 0,
      sway: options.sway ?? 0,
      swayPhase: Math.random() * 6.28,
      origin: at.x,
      shape: "sprite",
      ringTo: 0,
    });
  }

  private spawnRing(at: THREE.Vector3, color: number, to: number, life = 0.9): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(this.ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at);
    ring.scale.setScalar(0.5);
    ring.renderOrder = 7;
    this.scene.add(ring);
    this.particles.push({ object: ring, material, age: 0, life, velocity: new THREE.Vector3(), base: 0.5, grow: 0, spin: 0, sway: 0, swayPhase: 0, origin: 0, shape: "ring", ringTo: to });
  }

  private getLogoTexture(): THREE.CanvasTexture {
    if (this.logoTexture) return this.logoTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 320;
    const context = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const paint = (logo?: HTMLImageElement) => {
      context.clearRect(0, 0, 256, 320);
      context.fillStyle = "#e2012d";
      context.beginPath();
      context.moveTo(14, 10);
      context.lineTo(242, 10);
      context.lineTo(242, 250);
      context.lineTo(128, 312);
      context.lineTo(14, 250);
      context.closePath();
      context.fill();
      context.strokeStyle = "#ffd36b";
      context.lineWidth = 10;
      context.stroke();
      if (logo) context.drawImage(logo, 36, 96, 184, 74);
      context.fillStyle = "#ffffff";
      context.font = "800 30px 'Be Vietnam Pro', sans-serif";
      context.textAlign = "center";
      context.fillText("T1 FIGHTING", 128, 224);
      texture.needsUpdate = true;
    };
    paint();
    const logo = new Image();
    logo.onload = () => paint(logo);
    logo.src = "/brand/t1-logo-white.svg";
    this.logoTexture = texture;
    return texture;
  }

  /** Holds the T1 sign high above someone's head for a moment. */
  logo(avatar: Avatar, seconds: number): void {
    const material = new THREE.SpriteMaterial({ map: this.getLogoTexture(), transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 9;
    sprite.scale.set(0.1, 0.125, 1);
    this.scene.add(sprite);
    this.logos.push({ sprite, avatar, age: 0, life: seconds });
  }

  /** Starts the effects for an action. The avatar's own animation is started separately. */
  action(kind: ActionKind, avatar: Avatar): void {
    const duration = kind === "dance" ? 4.2 : kind === "jump" ? 2.5 : kind === "stand" ? 3.2 : 40;
    const emitter: Emitter = { avatar, kind, age: 0, duration, clock: 0, clock2: 0, step: 0, disc: null, beam: null, rig: null };

    if (kind === "oxygen") {
      const hose = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({
          color: 0x9be8ff,
          roughness: 0.25,
          metalness: 0.1,
          transparent: true,
          opacity: 0.85,
          emissive: 0x3ba5e8,
          emissiveIntensity: 0.45,
        }),
      );
      hose.visible = false;
      this.scene.add(hose);
      emitter.rig = { hose, reach: 0 };
    }

    if (kind === "dance") {
      const disc = new THREE.Mesh(this.discGeometry, new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      disc.rotation.x = -Math.PI / 2;
      disc.renderOrder = 6;
      this.scene.add(disc);
      emitter.disc = disc;
    }
    if (kind === "stand") {
      const beam = new THREE.Mesh(this.beamGeometry, new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      beam.renderOrder = 6;
      this.scene.add(beam);
      emitter.beam = beam;
      this.spawnRing(this.floorOf(avatar, new THREE.Vector3()), 0xffd36b, 8, 1.1);
    }
    this.emitters.push(emitter);
  }

  private finish(emitter: Emitter): void {
    for (const part of [emitter.disc, emitter.beam]) {
      if (!part) continue;
      this.scene.remove(part);
      (part.material as THREE.Material).dispose();
    }
    const rig = emitter.rig;
    if (rig) {
      this.scene.remove(rig.hose);
      for (const root of [rig.hose]) {
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        });
      }
    }
  }

  update(dt: number): void {
    for (let index = this.emitters.length - 1; index >= 0; index--) {
      const emitter = this.emitters[index];
      emitter.age += dt;
      const { avatar, kind } = emitter;
      const feet = this.floorOf(avatar, this.feet);
      const done = kind === "oxygen" ? !avatar.busy && emitter.age > 0.3 : emitter.age > emitter.duration;
      if (done || emitter.age > 40) {
        if (kind === "stand") this.spawnRing(feet.clone(), 0xffd36b, 7, 0.9);
        this.finish(emitter);
        this.emitters.splice(index, 1);
        continue;
      }

      if (kind === "dance") {
        emitter.clock += dt;
        emitter.clock2 += dt;
        if (emitter.disc) {
          emitter.disc.position.copy(feet);
          const pulse = 2.3 + Math.sin(emitter.age * 14) * 0.4;
          emitter.disc.scale.setScalar(pulse);
          (emitter.disc.material as THREE.MeshBasicMaterial).color.setHSL((emitter.age * 0.9) % 1, 1, 0.55);
          (emitter.disc.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.min(1, (emitter.duration - emitter.age) * 2);
        }
        while (emitter.clock > 0.15) {
          emitter.clock -= 0.15;
          const head = avatar.headPosition(this.head).clone();
          head.x += rand(-0.4, 0.4);
          head.y += rand(-0.3, 0.1);
          const symbol = ["♪", "♫", "♬"][Math.floor(Math.random() * 3)];
          this.spawnSprite(this.glyph(symbol, NOTE_COLORS[emitter.step++ % NOTE_COLORS.length]), head, {
            size: rand(1.0, 1.45),
            life: 1.5,
            velocity: new THREE.Vector3(rand(-0.25, 0.25), rand(0.8, 1.3), 0),
            sway: rand(0.2, 0.45),
            spin: rand(-1, 1),
          });
        }
        if (emitter.clock2 > 0.38) {
          emitter.clock2 = 0;
          this.spawnRing(feet.clone(), emitter.step % 2 ? 0xff3355 : 0xffd36b, 6.5, 1.0);
        }
      } else if (kind === "jump") {
        // Hops come 1.6 a second, so a landing every 0.625 s: a shockwave, dust and a few sparks each time.
        emitter.clock += dt;
        if (emitter.clock >= 0.625) {
          emitter.clock -= 0.625;
          this.spawnRing(feet.clone(), 0xffffff, 7, 0.75);
          for (let dust = 0; dust < 7; dust++) {
            const angle = (dust / 7) * Math.PI * 2 + rand(-0.3, 0.3);
            const at = feet.clone();
            at.y += 0.12;
            this.spawnSprite(this.texture("dust", () => softTexture("rgba(255,236,210,0.9)", "rgba(255,236,210,0)")), at, {
              size: 0.9,
              grow: 1.8,
              life: 0.65,
              velocity: new THREE.Vector3(Math.cos(angle) * 1.5, rand(0.15, 0.5), Math.sin(angle) * 0.9),
            });
          }
          for (let spark = 0; spark < 4; spark++) {
            const at = feet.clone();
            at.y += 0.3;
            this.spawnSprite(this.glyph("★", "#ffd36b"), at, { size: 0.7, life: 0.9, velocity: new THREE.Vector3(rand(-1.2, 1.2), rand(1.8, 2.8), 0), spin: rand(-6, 6) });
          }
        }
      } else if (kind === "stand") {
        if (emitter.beam) {
          emitter.beam.position.set(feet.x, feet.y + 2.5, feet.z);
          const fadeIn = Math.min(1, emitter.age / 0.4);
          const fadeOut = Math.min(1, (emitter.duration - emitter.age) / 0.5);
          (emitter.beam.material as THREE.MeshBasicMaterial).opacity = 0.34 * fadeIn * fadeOut * (0.85 + Math.sin(emitter.age * 12) * 0.15);
        }
        emitter.clock += dt;
        while (emitter.clock > 0.1) {
          emitter.clock -= 0.1;
          const at = feet.clone();
          at.x += rand(-0.4, 0.4);
          at.z += rand(-0.3, 0.3);
          at.y += 0.2;
          this.spawnSprite(this.glyph("✦", Math.random() < 0.5 ? "#ffd36b" : "#ffffff"), at, { size: rand(0.5, 0.8), life: 1.5, velocity: new THREE.Vector3(0, rand(1.2, 2.2), 0), sway: 0.2, spin: rand(-2, 2) });
        }
      } else {
        // Oxygen: dust while crawling to the tank, then the flexible tube stretches naturally to the mask with rising bubbles.
        const rig = emitter.rig;
        const breathing = avatar.masked;
        if (rig) {
          const station = avatar.oxygenStation();
          const valve = tankNozzlePosition(station);
          rig.reach += ((breathing ? 1 : 0) - rig.reach) * Math.min(1, dt * 7);
          const reach = rig.reach;
          const mouth = avatar.mouthPosition(new THREE.Vector3());
          const end = valve.clone().lerp(mouth, reach);
          const mid = valve.clone().lerp(end, 0.48);
          mid.y -= 0.38 * reach;
          mid.z += 0.08 * reach;
          mid.x += (mouth.x - valve.x) * 0.1 * reach;
          const nearMask = valve.clone().lerp(end, 0.85);
          nearMask.y += 0.02 * reach;

          const curve = new THREE.CatmullRomCurve3([
            valve,
            valve.clone().lerp(end, 0.16).add(new THREE.Vector3((mouth.x - valve.x) * 0.15 * reach, -0.15 * reach, 0.04 * reach)),
            mid,
            nearMask,
            end,
          ]);
          rig.hose.geometry.dispose();
          rig.hose.geometry = new THREE.TubeGeometry(curve, 28, 0.026, 8, false);
          rig.hose.visible = reach > 0.02;
        }
        emitter.clock += dt;
        if (emitter.clock > 0.28) {
          emitter.clock = 0;
          if (!breathing && avatar.root.position.y < 1.5) {
            const at = feet.clone();
            at.y += 0.1;
            this.spawnSprite(this.texture("dust", () => softTexture("rgba(255,236,210,0.9)", "rgba(255,236,210,0)")), at, { size: 0.6, grow: 1.5, life: 0.6, velocity: new THREE.Vector3(rand(-0.3, 0.3), 0.3, rand(-0.2, 0.2)) });
          }
        }

        // Oxygen bubbles rising from the mask when breathing at the tank!
        if (breathing) {
          emitter.clock2 += dt;
          if (emitter.clock2 > 0.32) {
            emitter.clock2 = 0;
            const mouth = avatar.mouthPosition(new THREE.Vector3());
            const at = mouth.clone();
            at.x += rand(-0.05, 0.05);
            at.y += rand(0.04, 0.12);
            at.z += rand(-0.04, 0.04);
            this.spawnSprite(this.texture("oxygenBubble", bubbleTexture), at, {
              size: rand(0.18, 0.28),
              grow: rand(0.2, 0.4),
              life: rand(1.3, 1.7),
              velocity: new THREE.Vector3(rand(-0.04, 0.04), rand(0.65, 0.95), rand(-0.03, 0.03)),
              sway: rand(0.08, 0.16),
              spin: rand(-1, 1),
            });
          }
        }
      }
    }

    for (let index = this.logos.length - 1; index >= 0; index--) {
      const item = this.logos[index];
      item.age += dt;
      const t = item.age / item.life;
      if (t >= 1) {
        this.scene.remove(item.sprite);
        item.sprite.material.dispose();
        this.logos.splice(index, 1);
        continue;
      }
      // It pops up with a bounce, sways with the raised arms, then drops away.
      const pop = t < 0.12 ? t / 0.12 : 1 + Math.sin((t - 0.12) * 14) * 0.05 * (1 - t);
      const size = 2.4 * Math.min(1, pop);
      const head = item.avatar.headPosition(this.head);
      item.sprite.position.set(head.x + Math.sin(item.age * 6) * 0.08, head.y + 0.45 + size * 0.5, head.z);
      item.sprite.scale.set(size * 0.8, size, 1);
      item.sprite.material.opacity = t > 0.82 ? (1 - t) / 0.18 : 1;
    }

    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.age += dt;
      const t = particle.age / particle.life;
      if (t >= 1) {
        this.scene.remove(particle.object);
        particle.material.dispose();
        this.particles.splice(index, 1);
        continue;
      }
      particle.object.position.addScaledVector(particle.velocity, dt);
      if (particle.shape === "ring") {
        particle.object.scale.setScalar(particle.base + (particle.ringTo - particle.base) * (1 - (1 - t) * (1 - t)));
        particle.material.opacity = 0.9 * (1 - t);
      } else {
        const sprite = particle.object as THREE.Sprite;
        sprite.scale.setScalar(particle.base * (1 + particle.grow * t));
        sprite.material.rotation += particle.spin * dt;
        if (particle.sway) sprite.position.x += Math.sin(particle.age * 5 + particle.swayPhase) * particle.sway * dt * 2;
        particle.material.opacity = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      }
    }
  }

  dispose(): void {
    for (const emitter of this.emitters) this.finish(emitter);
    this.emitters.length = 0;
    for (const particle of this.particles) {
      this.scene.remove(particle.object);
      particle.material.dispose();
    }
    this.particles.length = 0;
    for (const item of this.logos) {
      this.scene.remove(item.sprite);
      item.sprite.material.dispose();
    }
    this.logos.length = 0;
    this.logoTexture?.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.ringGeometry.dispose();
    this.discGeometry.dispose();
    this.beamGeometry.dispose();
  }
}
