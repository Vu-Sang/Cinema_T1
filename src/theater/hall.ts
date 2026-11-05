import * as THREE from "three";
import { CAPACITY, ROWS, SEATS_PER_ROW } from "../../shared/protocol.ts";

const ROW_PITCH = 0.98;
const ROW_RISE = 0.13;
const FIRST_ROW_Z = 4.7;
/** Three blocks with two aisles, matching the 3 + 4 + 3 seat map. */
const COLUMN_X = [-5, -4, -3, -1.5, -0.5, 0.5, 1.5, 3, 4, 5];
const SEAT_TOP = 0.42;
export const SIDE_AISLE_X = 6.25;

const COLORS = {
  floor: 0x2b0f16,
  riser: 0x3b151e,
  aisle: 0x5d1c28,
  gold: 0xc99c4b,
  goldDark: 0x8d6a2c,
  seat: 0x96202c,
  seatBack: 0x7c1824,
  curtain: 0x7a1622,
  wall: 0x120609,
  stage: 0x220b11,
  tank: 0x2860c8,
  tankCap: 0x1c2233,
  steel: 0xb8c0cc,
};

const flat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...extra });

export type SeatPlace = { x: number; y: number; z: number; row: number; column: number };

export function seatPlace(seat: number): SeatPlace {
  const index = seat - 1;
  const row = Math.floor(index / SEATS_PER_ROW);
  const column = index % SEATS_PER_ROW;
  return { x: COLUMN_X[column], y: row * ROW_RISE + SEAT_TOP, z: FIRST_ROW_Z + row * ROW_PITCH, row, column };
}

/** Height of the raked floor at a depth, so walking people climb the aisle. */
export function floorHeight(z: number): number {
  return THREE.MathUtils.clamp((z - FIRST_ROW_Z) / ROW_PITCH + 0.5, 0, ROWS) * ROW_RISE;
}

function box(width: number, height: number, depth: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildFloor(scene: THREE.Scene): void {
  const floorMaterial = flat(COLORS.floor);
  const riserMaterial = flat(COLORS.riser);
  const aisleMaterial = flat(COLORS.aisle);
  const goldMaterial = flat(COLORS.gold, { emissive: COLORS.goldDark, emissiveIntensity: 0.5 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 15;
  scene.add(floor);

  for (let row = 0; row < ROWS; row++) {
    const top = (row + 0.5) * ROW_RISE;
    const z = FIRST_ROW_Z + row * ROW_PITCH;
    scene.add(box(12.8, top, ROW_PITCH, riserMaterial, 0, top / 2, z));
    // Gold nosing on every step: the lines that draw the perspective across the house.
    scene.add(box(12.8, 0.018, 0.022, goldMaterial, 0, top + 0.01, z - ROW_PITCH / 2));
    for (const x of [-2.25, 2.25]) scene.add(box(0.9, 0.012, ROW_PITCH, aisleMaterial, x, top + 0.006, z));
  }

  // The floor behind the last row, level with it, running back past the camera.
  const backHeight = (ROWS - 0.5) * ROW_RISE;
  const backStart = FIRST_ROW_Z + (ROWS - 0.5) * ROW_PITCH;
  scene.add(box(60, backHeight, 30, riserMaterial, 0, backHeight / 2, backStart + 15));
  // The sloped sides of the house, so tanks stand on a floor rather than float beside the steps.
  for (const x of [-20, 20]) {
    for (let row = 0; row < ROWS; row++) {
      const top = (row + 0.5) * ROW_RISE;
      scene.add(box(27.2, top, ROW_PITCH, floorMaterial, x, top / 2, FIRST_ROW_Z + row * ROW_PITCH));
    }
  }
}

function buildChairs(scene: THREE.Scene): THREE.InstancedMesh {
  const parts: [THREE.BufferGeometry, THREE.Material, THREE.Vector3][] = [
    [new THREE.BoxGeometry(0.76, 0.14, 0.66), flat(COLORS.seat), new THREE.Vector3(0, -0.07, 0)],
    [new THREE.BoxGeometry(0.76, 0.5, 0.12), flat(COLORS.seatBack), new THREE.Vector3(0, 0.2, 0.33)],
    [new THREE.BoxGeometry(0.08, 0.3, 0.6), flat(COLORS.gold), new THREE.Vector3(-0.41, -0.08, 0.02)],
    [new THREE.BoxGeometry(0.08, 0.3, 0.6), flat(COLORS.gold), new THREE.Vector3(0.41, -0.08, 0.02)],
    [new THREE.BoxGeometry(0.9, 0.3, 0.74), flat(COLORS.goldDark), new THREE.Vector3(0, -0.28, 0.02)],
  ];
  const matrix = new THREE.Matrix4();
  for (const [geometry, material, offset] of parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    for (let seat = 1; seat <= CAPACITY; seat++) {
      const place = seatPlace(seat);
      matrix.setPosition(place.x + offset.x, place.y + offset.y, place.z + offset.z);
      mesh.setMatrixAt(seat - 1, matrix);
    }
    scene.add(mesh);
  }

  // Never drawn. A tall box per seat makes seats easy to hit, even behind the row in front.
  const hit = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 1.2, 0.9), new THREE.MeshBasicMaterial(), CAPACITY);
  for (let seat = 1; seat <= CAPACITY; seat++) {
    const place = seatPlace(seat);
    matrix.setPosition(place.x, place.y + 0.25, place.z);
    hit.setMatrixAt(seat - 1, matrix);
  }
  hit.visible = false;
  scene.add(hit);
  return hit;
}

let gaugeTex: THREE.CanvasTexture | null = null;
function getGaugeTexture(): THREE.CanvasTexture {
  if (gaugeTex) return gaugeTex;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;

  // White dial background
  context.fillStyle = "#f8fafc";
  context.beginPath();
  context.arc(64, 64, 60, 0, Math.PI * 2);
  context.fill();

  // Dark metallic bezel
  context.lineWidth = 6;
  context.strokeStyle = "#475569";
  context.stroke();

  // Green safe zone arc (normal breathing oxygen pressure)
  context.lineWidth = 9;
  context.strokeStyle = "#22c55e";
  context.beginPath();
  context.arc(64, 64, 46, Math.PI * 0.72, Math.PI * 1.82);
  context.stroke();

  // Red empty/warning zone arc
  context.strokeStyle = "#ef4444";
  context.beginPath();
  context.arc(64, 64, 46, Math.PI * 1.82, Math.PI * 2.28);
  context.stroke();

  // Tick marks
  context.strokeStyle = "#1e293b";
  context.lineWidth = 2.5;
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI * 0.72 + (i / 10) * Math.PI * 1.56;
    const r1 = i % 5 === 0 ? 37 : 41;
    const r2 = 50;
    context.beginPath();
    context.moveTo(64 + Math.cos(angle) * r1, 64 + Math.sin(angle) * r1);
    context.lineTo(64 + Math.cos(angle) * r2, 64 + Math.sin(angle) * r2);
    context.stroke();
  }

  // Label "O₂"
  context.fillStyle = "#0f172a";
  context.font = "800 18px 'Be Vietnam Pro', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("O₂", 64, 42);

  // Red indicator needle pointing to ~65% pressure
  const needleAngle = Math.PI * 1.32;
  context.strokeStyle = "#dc2626";
  context.lineWidth = 3.5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(64, 64);
  context.lineTo(64 + Math.cos(needleAngle) * 44, 64 + Math.sin(needleAngle) * 44);
  context.stroke();

  // Center cap
  context.fillStyle = "#1e293b";
  context.beginPath();
  context.arc(64, 64, 6, 0, Math.PI * 2);
  context.fill();

  gaugeTex = new THREE.CanvasTexture(canvas);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  return gaugeTex;
}

let shadowTex: THREE.CanvasTexture | null = null;
export function getShadowTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 60);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.75)");
  gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.4)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(canvas);
  return shadowTex;
}

function buildTank(side = -1): THREE.Group {
  const group = new THREE.Group();

  const blueTankMat = new THREE.MeshStandardMaterial({
    color: 0x1565c0,
    roughness: 0.35,
    metalness: 0.15,
  });
  const darkBaseMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.7,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.25,
    metalness: 0.8,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.6,
  });
  const valveKnobMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.4,
  });

  // 1. Rubber base boot
  const baseBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.08, 16), darkBaseMat);
  baseBoot.position.y = 0.04;
  group.add(baseBoot);

  // 2. Main cylinder body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.96, 16), blueTankMat);
  body.position.y = 0.54;
  group.add(body);

  // 3. Top dome / shoulder
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), blueTankMat);
  dome.position.y = 1.02;
  group.add(dome);

  // 4. Neck collar
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.12, 12), chromeMat);
  neck.position.y = 1.2;
  group.add(neck);

  // 5. Regulator block
  const regBlock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), brassMat);
  regBlock.position.y = 1.28;
  group.add(regBlock);

  // 6. Valve stem & wheel knob on top
  const valveStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), brassMat);
  valveStem.position.y = 1.34;
  const valveKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 12), valveKnobMat);
  valveKnob.position.y = 1.38;
  group.add(valveStem, valveKnob);

  // 7. Pressure Gauge facing slightly towards the aisle / camera
  const gaugeCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), chromeMat);
  gaugeCasing.rotation.x = Math.PI / 2;
  gaugeCasing.position.set(0, 1.28, 0.07);

  const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.068, 16), new THREE.MeshBasicMaterial({ map: getGaugeTexture() }));
  gaugeFace.position.set(0, 1.28, 0.086);

  const gaugeGroup = new THREE.Group();
  gaugeGroup.add(gaugeCasing, gaugeFace);
  gaugeGroup.rotation.y = -0.3 * side;
  group.add(gaugeGroup);

  // 8. Hose outlet nozzle (points inward toward the aisle / avatar)
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8), brassMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-side * 0.07, 1.26, 0);
  group.add(nozzle);

  // 9. Soft drop shadow on floor
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, opacity: 0.65, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  group.add(shadow);

  return group;
}

/** Where someone crawls to for oxygen: the tank clusters along the side aisles. */
export const OXYGEN_STATIONS: THREE.Vector3[] = [1, 4, 7].flatMap((row) => {
  const z = FIRST_ROW_Z + row * ROW_PITCH;
  return [new THREE.Vector3(-SIDE_AISLE_X - 0.65, 0, z), new THREE.Vector3(SIDE_AISLE_X + 0.65, 0, z)];
});

/** Exact 3D world position where the oxygen hose connects to the tank's nozzle. */
export function tankNozzlePosition(station: THREE.Vector3): THREE.Vector3 {
  const side = Math.sign(station.x);
  const tankX = station.x + side * 0.3;
  const tankZ = station.z - 0.45;
  const tankY = floorHeight(station.z);
  return new THREE.Vector3(tankX - side * 0.07, tankY + 1.26, tankZ);
}

function buildTanks(scene: THREE.Scene): void {
  const placeCluster = (position: THREE.Vector3, count: number, side: number) => {
    for (let index = 0; index < count; index++) {
      const tank = buildTank(side);
      tank.position.set(position.x + (index - (count - 1) / 2) * 0.33, position.y, position.z);
      scene.add(tank);
    }
  };
  OXYGEN_STATIONS.forEach((station, index) => {
    const side = Math.sign(station.x);
    placeCluster(
      new THREE.Vector3(station.x + side * 0.3, floorHeight(station.z), station.z - 0.45),
      2 + (index % 2),
      side,
    );
  });
  placeCluster(new THREE.Vector3(-3.4, 0.45, 2.4), 3, -1);
  placeCluster(new THREE.Vector3(3.4, 0.45, 2.4), 3, 1);
}

function pleatedCurtain(width: number, height: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height, 28, 1).toNonIndexed();
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    positions.setZ(index, Math.sin((positions.getX(index) / width) * Math.PI * 14) * 0.13);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export type Sides = { left: THREE.Group; right: THREE.Group };

function buildSides(scene: THREE.Scene): Sides {
  const curtainMaterial = flat(COLORS.curtain, { side: THREE.DoubleSide });
  const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x1c080d, side: THREE.DoubleSide });
  const goldMaterial = flat(COLORS.gold);

  const build = (direction: 1 | -1) => {
    const group = new THREE.Group();
    const curtain = pleatedCurtain(3.2, 14, curtainMaterial);
    curtain.position.set(direction * 0.6, 7, 0);
    const trim = box(0.1, 14, 0.1, goldMaterial, direction * -1.02, 7, 0.1);
    // Side wall running back toward the audience, past the camera.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), wallMaterial);
    wall.rotation.y = direction * -Math.PI / 2;
    wall.position.set(direction * 2.2, 7, 20);
    group.add(curtain, trim, wall);
    scene.add(group);
    return group;
  };
  return { left: build(-1), right: build(1) };
}

function buildExitSign(left: THREE.Group): void {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 56;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#0d8a3e";
  context.fillRect(0, 0, 128, 56);
  context.fillStyle = "#fff";
  context.font = "700 28px 'Be Vietnam Pro', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("LỐI RA", 64, 30);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }),
  );
  sign.material.map!.colorSpace = THREE.SRGBColorSpace;
  sign.position.set(2.15, 3.2, 8);
  sign.rotation.y = Math.PI / 2;
  left.add(sign);

  const door = box(0.06, 2.3, 1.2, flat(0x1a2a24), 2.17, 1.15, 8);
  left.add(door);
}

function buildStage(scene: THREE.Scene): void {
  // Unlit, so the back wall stays black around the bright screen whatever the house lights do.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: COLORS.wall }));
  wall.position.set(0, 10, 0);
  scene.add(wall);
  scene.add(box(40, 0.45, 3.2, flat(COLORS.stage), 0, 0.225, 1.6));
  scene.add(box(40, 0.035, 0.035, flat(COLORS.gold, { emissive: COLORS.goldDark }), 0, 0.46, 3.2));
}

export type Banners = { left: THREE.Mesh; right: THREE.Mesh };

/** Red T1 pennants for the back wall. Scene.layout places and sizes them to fit the window. */
function buildBanners(scene: THREE.Scene): Banners {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 640;
  const context = canvas.getContext("2d")!;
  const paint = (logo?: HTMLImageElement) => {
    context.clearRect(0, 0, 256, 640);
    context.fillStyle = "#b90126";
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(256, 0);
    context.lineTo(256, 560);
    context.lineTo(128, 640);
    context.lineTo(0, 560);
    context.closePath();
    context.fill();
    context.strokeStyle = "#d9ad4f";
    context.lineWidth = 8;
    context.strokeRect(14, 14, 228, 500);
    if (logo) context.drawImage(logo, 38, 90, 180, 72);
    context.fillStyle = "#ffd36b";
    context.font = "40px sans-serif";
    context.textAlign = "center";
    // Six stars in two rows, the way T1 shows its six world titles.
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) context.fillText("★", 68 + column * 60, 250 + row * 56);
    }
    context.fillStyle = "#ffffff";
    context.font = "800 44px 'Be Vietnam Pro', sans-serif";
    context.fillText("T ĐỎ", 128, 430);
    context.font = "600 20px 'Be Vietnam Pro', sans-serif";
    context.fillText("thở oxy cùng nhau", 128, 474);
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const logo = new Image();
  logo.onload = () => {
    paint(logo);
    texture.needsUpdate = true;
  };
  logo.src = "/brand/t1-logo-white.svg";

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, color: 0xdddddd });
  const build = () => {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    scene.add(banner);
    return banner;
  };
  return { left: build(), right: build() };
}

export function buildHall(scene: THREE.Scene): { hit: THREE.InstancedMesh; sides: Sides; banners: Banners } {
  buildStage(scene);
  buildFloor(scene);
  const hit = buildChairs(scene);
  buildTanks(scene);
  const sides = buildSides(scene);
  buildExitSign(sides.left);
  return { hit, sides, banners: buildBanners(scene) };
}

/** World-space corners of the seating, used to fit it into the space under the screen. */
export const SEATING_BOUNDS: THREE.Vector3[] = [
  new THREE.Vector3(-7.7, 1.1, FIRST_ROW_Z - 0.2),
  new THREE.Vector3(7.7, 1.1, FIRST_ROW_Z - 0.2),
  new THREE.Vector3(-7.7, ROWS * ROW_RISE - 0.3, FIRST_ROW_Z + (ROWS - 1) * ROW_PITCH + 0.45),
  new THREE.Vector3(7.7, ROWS * ROW_RISE - 0.3, FIRST_ROW_Z + (ROWS - 1) * ROW_PITCH + 0.45),
];
