import * as THREE from "three";
import type { Look } from "../../shared/look.ts";
import { Avatar, type AvatarDisplay } from "./avatar.ts";

const MAX_PIXEL_RATIO = 1.75;

export type StagePerson = {
  id: string;
  name: string;
  look: Look;
  x: number;
  z?: number;
  display?: AvatarDisplay;
};

type Options = {
  /** Camera framing: how far back it sits and the height it looks at. */
  distance: number;
  lookY: number;
  /** On a canvas narrower than this width-to-height ratio, the camera backs away so nobody is cut off. */
  minAspect?: number;
  /** Turn the turntable slowly from side to side. */
  sway: boolean;
  /** Add the blue oxygen tanks at these x positions. */
  tanks?: number[];
  /** Someone breaks into a dance every few seconds. */
  liveliness?: boolean;
};

function oxygenTank(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x2860c8, flatShading: true, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.05, 10), blue);
  body.position.y = 0.52;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), blue);
  top.position.y = 1.05;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x1c2233 }));
  neck.position.y = 1.3;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  band.position.y = 0.72;
  group.add(body, top, neck, band);
  group.position.set(x, 0, z);
  return group;
}

/** A small transparent 3D stage for people outside the theatre: the home banner and the character preview. */
export class CharacterStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private readonly turntable = new THREE.Group();
  private readonly people = new Map<string, Avatar>();
  private readonly observer: ResizeObserver;
  private frame = 0;
  private lastTime = performance.now();
  private clock = 0;
  private nextDance = 2;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: Options,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.camera.position.set(0, options.lookY + 0.35, -options.distance);
    this.camera.lookAt(0, options.lookY, 0);

    const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
    key.position.set(-3, 5, -6);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffb6a8, 1.8), key, this.turntable);
    for (const x of options.tanks ?? []) this.turntable.add(oxygenTank(x, 0.5));

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (!clientWidth || !clientHeight) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.position.z = -this.options.distance * Math.max(1, (this.options.minAspect ?? 0) / this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  setPeople(people: StagePerson[]): void {
    for (const avatar of this.people.values()) {
      this.turntable.remove(avatar.root);
      avatar.dispose();
    }
    this.people.clear();
    for (const person of people) {
      const display = person.display ?? "standing";
      const avatar = new Avatar(person.id, person.name, person.look, { x: person.x, y: 0, z: person.z ?? 0, row: 0, column: 0 });
      avatar.display = display;
      this.people.set(person.id, avatar);
      this.turntable.add(avatar.root);
    }
  }

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.clock += dt;

    if (this.options.sway) this.turntable.rotation.y = Math.sin(this.clock * 0.7) * 0.55;
    if (this.options.liveliness && this.clock > this.nextDance) {
      this.nextDance = this.clock + 2.5 + Math.random() * 2.5;
      const standing = [...this.people.values()].filter((avatar) => avatar.display === "standing" && !avatar.busy);
      standing[Math.floor(Math.random() * standing.length)]?.play(Math.random() < 0.6 ? "dance" : "jump");
    }
    for (const avatar of this.people.values()) avatar.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    for (const avatar of this.people.values()) avatar.dispose();
    this.people.clear();
    this.renderer.dispose();
    // Browsers cap live WebGL contexts, and this stage opens and closes with the character panel.
    this.renderer.forceContextLoss();
  }
}
