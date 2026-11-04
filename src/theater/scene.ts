import * as THREE from "three";
import type { ActionKind, Seats } from "../../shared/protocol.ts";
import { Avatar, setLightstickGlow } from "./avatar.ts";
import { buildHall, SEATING_BOUNDS, seatPlace, type Banners, type Sides } from "./hall.ts";

const MAX_PIXEL_RATIO = 1.5;
const MAX_ZOOM = 2.4;
const PHONE_WIDTH = 760;
const CURTAIN_INSET = 1.1;
const LIGHTS_ON = { hemisphere: 1.9, key: 1.6, screen: 12 };
const LIGHTS_OFF = { hemisphere: 0.85, key: 0.5, screen: 34 };

type Callbacks = {
  onSeatClick: (seat: number) => void;
  onHover: (seat: number | null) => void;
  onFrame: () => void;
};

export class TheaterScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly hit: THREE.InstancedMesh;
  private readonly sides: Sides;
  private readonly banners: Banners;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly screenGlow: THREE.PointLight;
  private readonly hoverMark: THREE.Mesh;
  private readonly avatars = new Map<string, { avatar: Avatar; seat: number; key: string }>();
  private readonly projected = new THREE.Vector3();
  private lights = LIGHTS_ON;
  private hovered: number | null = null;
  private frame = 0;
  private lastTime = performance.now();
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.scene.background = new THREE.Color(0x0a0305);
    this.camera.position.set(0, 10.5, 26);
    this.camera.lookAt(0, 1.2, 8);

    this.hemisphere = new THREE.HemisphereLight(0xffe7cf, 0x3b1019, LIGHTS_ON.hemisphere);
    this.key = new THREE.DirectionalLight(0xfff0dc, LIGHTS_ON.key);
    this.key.position.set(-4, 12, 16);
    this.screenGlow = new THREE.PointLight(0xffd9a8, LIGHTS_ON.screen, 26, 1.4);
    this.screenGlow.position.set(0, 5, 4);
    this.scene.add(this.hemisphere, this.key, this.screenGlow);

    const hall = buildHall(this.scene);
    this.hit = hall.hit;
    this.sides = hall.sides;
    this.banners = hall.banners;

    this.hoverMark = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.72, 0.84),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.hoverMark.visible = false;
    this.scene.add(this.hoverMark);

    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerleave", this.handleLeave);
    canvas.addEventListener("click", this.handleClick);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Fits the seating into the free space below the screen; curtains follow the window edges. */
  layout(width: number, height: number, top: number, bottom: number, screenRight: number, screenTop: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.zoom = 1;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();

    const measure = () => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const corner of SEATING_BOUNDS) {
        const point = this.projected.copy(corner).project(this.camera);
        const x = ((point.x + 1) / 2) * width;
        const y = ((1 - point.y) / 2) * height;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { minX, maxX, minY, maxY };
    };

    const start = measure();
    const available = Math.max(80, bottom - top);
    // On phones the seats matter more than the tanks at the edges, so those may crop.
    const usableWidth = width * (width < PHONE_WIDTH ? 1.22 : 0.98);
    const zoom = Math.min(usableWidth / (start.maxX - start.minX), available / (start.maxY - start.minY), MAX_ZOOM);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();

    const zoomed = measure();
    const shiftY = (top + bottom) / 2 - (zoomed.minY + zoomed.maxY) / 2;
    this.camera.setViewOffset(width, height, 0, -shiftY, width, height);
    this.camera.updateProjectionMatrix();

    // World x of the window edge at the depth of the stage front, found by unprojecting.
    const edge = new THREE.Vector3(1, 0, 0.5).unproject(this.camera);
    const direction = edge.sub(this.camera.position).normalize();
    const distance = (3.2 - this.camera.position.z) / direction.z;
    const edgeX = Math.abs(this.camera.position.x + direction.x * distance);
    const curtainX = Math.max(edgeX - CURTAIN_INSET, 8.9);
    this.sides.left.position.set(-curtainX, 0, 3.2);
    this.sides.right.position.set(curtainX, 0, 3.2);
    this.placeBanners(width, screenRight, screenTop, top, curtainX);
  }

  /** Hangs the T1 banners on the back wall, centred in the gap between the screen and the curtain. */
  private placeBanners(width: number, screenRight: number, screenTop: number, stageBottom: number, curtainX: number): void {
    const worldOnWall = (screenX: number, screenY: number) => {
      const point = new THREE.Vector3((screenX / width) * 2 - 1, 1 - (screenY / this.height) * 2, 0.5).unproject(this.camera);
      const direction = point.sub(this.camera.position).normalize();
      const distance = (0.05 - this.camera.position.z) / direction.z;
      return this.camera.position.clone().addScaledVector(direction, distance);
    };
    const top = worldOnWall(screenRight, screenTop);
    const bottom = worldOnWall(screenRight, stageBottom);
    const left = top.x + 0.5;
    const right = curtainX - 1.1;
    const gap = right - left;
    const height = (top.y - bottom.y) * 0.82;
    const bannerWidth = Math.min(gap * 0.8, height * 0.42);
    const fits = bannerWidth > 0.6;
    this.banners.left.visible = fits;
    this.banners.right.visible = fits;
    if (!fits) return;
    const centerY = (top.y + bottom.y) / 2;
    const centerX = (left + right) / 2;
    this.banners.left.position.set(-centerX, centerY, 0.05);
    this.banners.right.position.set(centerX, centerY, 0.05);
    this.banners.left.scale.set(bannerWidth, height, 1);
    this.banners.right.scale.set(bannerWidth, height, 1);
  }

  setLightsOn(on: boolean): void {
    this.lights = on ? LIGHTS_ON : LIGHTS_OFF;
    setLightstickGlow(on ? 0.3 : 0.95);
  }

  setSeats(seats: Seats, youId: string | null): void {
    const present = new Set<string>();
    for (const [key, person] of Object.entries(seats)) {
      const seat = Number(key);
      present.add(person.id);
      const appearance = JSON.stringify([person.name, person.look]);
      let existing = this.avatars.get(person.id);
      if (existing && existing.key !== appearance) {
        // A saved character swaps in place: same seat, new body.
        this.scene.remove(existing.avatar.root);
        existing.avatar.dispose();
        this.avatars.delete(person.id);
        existing = undefined;
      }
      if (existing) {
        if (existing.seat !== seat) {
          existing.avatar.moveTo(seatPlace(seat));
          existing.seat = seat;
        }
        existing.avatar.setMine(person.id === youId);
      } else {
        const avatar = new Avatar(person.id, person.name, person.look, seatPlace(seat));
        avatar.setMine(person.id === youId);
        this.scene.add(avatar.root);
        this.avatars.set(person.id, { avatar, seat, key: appearance });
      }
    }
    for (const [id, entry] of this.avatars) {
      if (present.has(id)) continue;
      this.scene.remove(entry.avatar.root);
      entry.avatar.dispose();
      this.avatars.delete(id);
    }
  }

  playAction(userId: string, kind: ActionKind): void {
    this.avatars.get(userId)?.avatar.play(kind);
  }

  /** Screen position just above someone's head, or null if they are not in a seat. */
  headOnScreen(userId: string): { x: number; y: number } | null {
    const entry = this.avatars.get(userId);
    if (!entry) return null;
    const point = entry.avatar.headPosition(this.projected).project(this.camera);
    return { x: ((point.x + 1) / 2) * this.width, y: ((1 - point.y) / 2) * this.height };
  }

  seatOnScreen(seat: number): { x: number; y: number } {
    const place = seatPlace(seat);
    const point = this.projected.set(place.x, place.y + 1.25, place.z).project(this.camera);
    return { x: ((point.x + 1) / 2) * this.width, y: ((1 - point.y) / 2) * this.height };
  }

  private seatAt(event: PointerEvent | MouseEvent): number | null {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const [first] = this.raycaster.intersectObject(this.hit);
    return first?.instanceId !== undefined ? first.instanceId + 1 : null;
  }

  private handleMove = (event: PointerEvent) => {
    const seat = this.seatAt(event);
    if (seat === this.hovered) return;
    this.hovered = seat;
    this.canvas.style.cursor = seat ? "pointer" : "default";
    this.hoverMark.visible = seat !== null;
    if (seat) {
      const place = seatPlace(seat);
      this.hoverMark.position.set(place.x, place.y + 0.1, place.z);
    }
    this.callbacks.onHover(seat);
  };

  private handleLeave = () => {
    this.hovered = null;
    this.hoverMark.visible = false;
    this.callbacks.onHover(null);
  };

  private handleClick = (event: MouseEvent) => {
    const seat = this.seatAt(event);
    if (seat) this.callbacks.onSeatClick(seat);
  };

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const fade = 1 - Math.exp(-1.6 * dt);
    this.hemisphere.intensity += (this.lights.hemisphere - this.hemisphere.intensity) * fade;
    this.key.intensity += (this.lights.key - this.key.intensity) * fade;
    this.screenGlow.intensity += (this.lights.screen - this.screenGlow.intensity) * fade;

    for (const { avatar } of this.avatars.values()) avatar.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.callbacks.onFrame();
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointermove", this.handleMove);
    this.canvas.removeEventListener("pointerleave", this.handleLeave);
    this.canvas.removeEventListener("click", this.handleClick);
    for (const { avatar } of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.renderer.dispose();
  }
}
