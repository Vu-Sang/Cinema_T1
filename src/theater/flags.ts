import * as THREE from "three";

export type FlagMember = { name: string; photo: string };

const FLAG_ART = "/brand/t1-flag.webp";
const TEXTURE_WIDTH = 948;
const TEXTURE_HEIGHT = 1860;
const FLAG_RATIO = TEXTURE_WIDTH / TEXTURE_HEIGHT;
const GAP = 0.14;
const EMBERS = 70;
const MARGIN = 0.88;
const MAX_PIXEL_RATIO = 2;
const DROP_SECONDS = 1.1;
const DROP_STAGGER = 0.16;

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSwing;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vShade;

  void main() {
    vUv = uv;
    // Only the wreath at the tip moves. Everything down to the name stays rigid so the player is never distorted.
    float free = smoothstep(0.64, 1.0, 1.0 - uv.y);
    // Slow gusts lift and drop the strength of the wind, so it never settles into a loop.
    float gust = 0.72 + 0.28 * sin(uTime * 0.53 + uPhase) * sin(uTime * 0.21 + uPhase * 2.0);
    float ripple = uv.x * 4.5 + uv.y * 8.0 - uTime * 3.2 + uPhase;
    float flutter = uv.x * 11.0 + uv.y * 19.0 - uTime * 6.0 + uPhase;
    float sway = sin(uv.y * 3.0 - uTime * 1.4 + uPhase) * 0.075 * uSwing;
    vec3 moved = position;
    moved.x += free * gust * (sin(ripple) * 0.05 + sin(flutter) * 0.012 + sway + 0.035);
    moved.y += free * gust * cos(ripple * 0.7) * 0.012;
    vShade = 1.0 + (cos(ripple) * 0.3 + cos(flutter) * 0.07) * gust * free;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vShade;

  void main() {
    vec4 color = texture2D(uMap, vUv);
    if (color.a < 0.02) discard;
    gl_FragColor = vec4(color.rgb * vShade, color.a);
    #include <colorspace_fragment>
  }
`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

/** Prints the player onto the artwork, fading into the cloth so the flag itself stays exactly as drawn. */
function paintFlag(member: FlagMember, art: HTMLImageElement, photo: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d")!;
  context.drawImage(art, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  const area = { x: 62, y: 40, width: 824, height: 1010 };
  const print = document.createElement("canvas");
  print.width = area.width;
  print.height = area.height;
  const printing = print.getContext("2d")!;
  // The source photo ends in a printed name bar, so only the part above it is used.
  const sourceHeight = photo.naturalHeight * 0.86;
  const sourceWidth = sourceHeight * (area.width / area.height);
  printing.filter = "contrast(1.1) saturate(1.05)";
  printing.drawImage(photo, (photo.naturalWidth - sourceWidth) / 2, 0, sourceWidth, sourceHeight, 0, 0, area.width, area.height);
  printing.filter = "none";
  printing.globalCompositeOperation = "destination-in";
  const down = printing.createLinearGradient(0, 0, 0, area.height);
  down.addColorStop(0, "rgba(0,0,0,0.85)");
  down.addColorStop(0.62, "rgba(0,0,0,1)");
  down.addColorStop(1, "rgba(0,0,0,0)");
  printing.fillStyle = down;
  printing.fillRect(0, 0, area.width, area.height);
  const across = printing.createLinearGradient(0, 0, area.width, 0);
  across.addColorStop(0, "rgba(0,0,0,0)");
  across.addColorStop(0.1, "rgba(0,0,0,1)");
  across.addColorStop(0.9, "rgba(0,0,0,1)");
  across.addColorStop(1, "rgba(0,0,0,0)");
  printing.fillStyle = across;
  printing.fillRect(0, 0, area.width, area.height);
  context.drawImage(print, area.x, area.y);

  const label = member.name.toLocaleUpperCase("vi-VN");
  let size = 128;
  context.font = `900 ${size}px "Unbounded", sans-serif`;
  while (context.measureText(label).width > 740 && size > 60) {
    size -= 4;
    context.font = `900 ${size}px "Unbounded", sans-serif`;
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  const gold = context.createLinearGradient(0, 1060, 0, 1200);
  gold.addColorStop(0, "#fff4d6");
  gold.addColorStop(1, "#e2b65c");
  context.shadowColor = "rgba(0, 0, 0, 0.9)";
  context.shadowBlur = 26;
  context.shadowOffsetY = 6;
  context.fillStyle = gold;
  context.fillText(label, TEXTURE_WIDTH / 2, 1130);
  context.shadowColor = "transparent";
  return canvas;
}

type Flag = { mesh: THREE.Mesh; material: THREE.ShaderMaterial; texture: THREE.CanvasTexture; startAt: number };

/** Hangs one cloth banner per member from the top of the canvas; they drop in, then keep waving. */
export class FlagStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly flags: Flag[] = [];
  private readonly embers: THREE.Points;
  private readonly emberState = Array.from({ length: EMBERS }, () => ({ x: Math.random(), y: Math.random(), speed: 0.4 + Math.random() * 0.9, phase: Math.random() * 6 }));
  private readonly resizeObserver: ResizeObserver;
  private readonly viewObserver: IntersectionObserver;
  private paused = false;
  private flagHeight = 1;
  private frame = 0;
  private clock = 0;
  private lastTime = 0;
  private inView = true;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0x000000, 0);
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3));
    this.embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({ color: 0xff6a2b, size: 3, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthTest: false }),
    );
    this.embers.renderOrder = 1;
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(canvas);
    // Nothing on this canvas needs drawing once it has scrolled away.
    this.viewObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      if (this.inView) this.schedule();
    });
    this.viewObserver.observe(canvas);
  }

  async setMembers(members: FlagMember[]): Promise<void> {
    await document.fonts.load(`900 128px "Unbounded"`);
    const [art, ...photos] = await Promise.all([FLAG_ART, ...members.map((member) => member.photo)].map(loadImage));
    const canvases = members.map((member, index) => paintFlag(member, art, photos[index]));
    if (this.disposed) return;

    const geometry = new THREE.PlaneGeometry(1, 1, 24, 56).translate(0, -0.5, 0);
    canvases.forEach((painted, index) => {
      const texture = new THREE.CanvasTexture(painted);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        uniforms: { uMap: { value: texture }, uTime: { value: 0 }, uSwing: { value: 1 }, uPhase: { value: index * 1.7 } },
      });
      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
      this.flags.push({ mesh, material, texture, startAt: index * DROP_STAGGER });
    });
    this.layout();
    this.schedule();
  }

  /** Freezes the flags where they are; a viewer can stop the motion with the button in the hero. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      // Paused before they have landed: show them hanging rather than stuck in mid-air.
      this.clock = Math.max(this.clock, DROP_STAGGER * this.flags.length + DROP_SECONDS + 2);
      if (this.flags.length) this.draw();
    } else {
      this.schedule();
    }
  }

  private layout(): void {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();

    const count = this.flags.length || 1;
    const widest = (width * MARGIN) / (count + (count - 1) * GAP);
    const flagWidth = Math.min(widest, height * FLAG_RATIO);
    this.flagHeight = flagWidth / FLAG_RATIO;
    const span = flagWidth * (count + (count - 1) * GAP);
    this.flags.forEach((flag, index) => {
      flag.mesh.position.x = (width - span) / 2 + flagWidth / 2 + index * flagWidth * (1 + GAP);
      flag.mesh.scale.set(flagWidth, this.flagHeight, 1);
    });
    this.draw();
  }

  private draw(): void {
    for (const flag of this.flags) {
      const elapsed = Math.max(0, this.clock - flag.startAt);
      const progress = Math.min(1, elapsed / DROP_SECONDS);
      // Falls fast, overshoots the rail slightly and settles.
      const eased = 1 + 2.2 * Math.pow(progress - 1, 3) + 1.2 * Math.pow(progress - 1, 2);
      flag.mesh.position.y = (1 - eased) * this.flagHeight;
      // The landing shakes the cloth, and the shake dies away.
      flag.material.uniforms.uSwing.value = 1 + 5 * Math.exp(-Math.max(0, elapsed - DROP_SECONDS * 0.6) * 1.4);
      flag.material.uniforms.uTime.value = this.clock;
    }
    this.moveEmbers();
    this.renderer.render(this.scene, this.camera);
  }

  /** Sparks carried on the same wind as the flags, wrapping round when they leave the frame. */
  private moveEmbers(): void {
    const positions = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    const { right: width, bottom } = this.camera;
    this.emberState.forEach((ember, index) => {
      const x = (ember.x + this.clock * 0.05 * ember.speed) % 1;
      const y = (ember.y + this.clock * 0.09 * ember.speed) % 1;
      positions.setXYZ(index, x * width + Math.sin(this.clock * ember.speed + ember.phase) * 14, bottom * (1 - y), 0);
    });
    positions.needsUpdate = true;
  }

  private schedule(): void {
    if (this.paused || this.frame || this.disposed) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.frame = 0;
    if (!this.inView || this.paused || this.disposed) return;
    this.clock += Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.viewObserver.disconnect();
    for (const flag of this.flags) {
      flag.texture.dispose();
      flag.material.dispose();
      flag.mesh.geometry.dispose();
    }
    this.embers.geometry.dispose();
    (this.embers.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
