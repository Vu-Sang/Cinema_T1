export const SKIN_COLORS = ["#f6d2b4", "#eec39f", "#dfae86", "#c98f66"] as const;
export const HAIR_COLORS = ["#15110f", "#2a1b14", "#4a2c1b", "#6f4526", "#a8742f", "#c9c4c0", "#a3142b", "#1f3a8a"] as const;

export const HAIR_STYLES = [
  { id: "short", label: "Tóc ngắn" },
  { id: "long", label: "Tóc dài" },
  { id: "bun", label: "Búi tóc" },
  { id: "spiky", label: "Tóc dựng" },
] as const;

export const OUTFITS = [
  { id: "home", label: "Áo đấu trắng" },
  { id: "jacket", label: "Áo khoác đen" },
  { id: "red", label: "Áo đỏ T1" },
  { id: "gold", label: "Áo vàng vô địch" },
  { id: "clown", label: "Chú hề" },
  { id: "acrobat", label: "Nghệ sĩ nhào lộn" },
  { id: "ringmaster", label: "Ông bầu gánh xiếc" },
  { id: "strongman", label: "Lực sĩ" },
  { id: "mime", label: "Kịch câm" },
] as const;

export const HEADWEAR = [
  { id: "none", label: "Không đội" },
  { id: "cap", label: "Mũ lưỡi trai" },
  { id: "headband", label: "Băng đô T1" },
  { id: "crown", label: "Vương miện" },
  { id: "tophat", label: "Mũ chóp cao" },
  { id: "beret", label: "Mũ nồi" },
] as const;

export const FACES = [
  { id: "none", label: "Mặt mộc" },
  { id: "clown", label: "Mũi hề" },
  { id: "mime", label: "Mặt trắng" },
  { id: "mustache", label: "Ria mép" },
] as const;

export const ITEMS = [
  { id: "none", label: "Tay không" },
  { id: "lightstick", label: "Lightstick T1" },
  { id: "flag", label: "Cờ T1" },
  { id: "foam", label: "Găng cổ vũ" },
  { id: "cup", label: "Cúp mini" },
] as const;

export type Look = {
  skin: number;
  hairColor: number;
  hairStyle: (typeof HAIR_STYLES)[number]["id"];
  outfit: (typeof OUTFITS)[number]["id"];
  headwear: (typeof HEADWEAR)[number]["id"];
  item: (typeof ITEMS)[number]["id"];
  face: (typeof FACES)[number]["id"];
  glasses: boolean;
};

export const DEFAULT_LOOK: Look = {
  skin: 0,
  hairColor: 0,
  hairStyle: "short",
  outfit: "home",
  headwear: "none",
  item: "lightstick",
  face: "none",
  glasses: false,
};

const has = (list: readonly { id: string }[], value: unknown) => list.some((option) => option.id === value);
const inRange = (value: unknown, length: number) => Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;

/** Looks arrive from browsers and old cookies, so anything unknown falls back to the default. */
export function sanitizeLook(input: unknown): Look {
  const look = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    skin: inRange(look.skin, SKIN_COLORS.length) ? (look.skin as number) : DEFAULT_LOOK.skin,
    hairColor: inRange(look.hairColor, HAIR_COLORS.length) ? (look.hairColor as number) : DEFAULT_LOOK.hairColor,
    hairStyle: has(HAIR_STYLES, look.hairStyle) ? (look.hairStyle as Look["hairStyle"]) : DEFAULT_LOOK.hairStyle,
    outfit: has(OUTFITS, look.outfit) ? (look.outfit as Look["outfit"]) : DEFAULT_LOOK.outfit,
    headwear: has(HEADWEAR, look.headwear) ? (look.headwear as Look["headwear"]) : DEFAULT_LOOK.headwear,
    item: has(ITEMS, look.item) ? (look.item as Look["item"]) : DEFAULT_LOOK.item,
    face: has(FACES, look.face) ? (look.face as Look["face"]) : DEFAULT_LOOK.face,
    glasses: look.glasses === true,
  };
}

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/** Returns a clean display name, or null when it is too short once cleaned. */
export function sanitizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\p{C}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = Array.from(cleaned).slice(0, NAME_MAX);
  return characters.length >= NAME_MIN ? characters.join("").trim() : null;
}

export function randomLook(random: () => number = Math.random): Look {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  return {
    skin: Math.floor(random() * SKIN_COLORS.length),
    hairColor: Math.floor(random() * HAIR_COLORS.length),
    hairStyle: pick(HAIR_STYLES).id,
    outfit: pick(OUTFITS).id,
    headwear: pick(HEADWEAR).id,
    item: pick(ITEMS).id,
    face: pick(FACES).id,
    glasses: random() < 0.35,
  };
}
