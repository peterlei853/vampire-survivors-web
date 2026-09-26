/** Playable hunters. Stats and art keys live here so a new body is a row, not a branch. */

export const CHARACTER_STORAGE_KEY = "nightfall.character";

export const CHARACTERS = {
  hunter: {
    id: "hunter",
    name: "The Hunter",
    blurb: "Fast, rapid stakes.",
    maxHp: 100,
    speed: 168,
    damage: 12,
    attackInterval: 0.56,
    pierce: 0,
    artKey: "hunter",
    sheet: {
      frameWidth: 68,
      frameHeight: 68,
      walkFrames: 6,
      files: [
        { image: "assets/player_sheet.png", meta: "assets/player_sheet.json" },
      ],
    },
  },
  warden_hunter: {
    id: "warden_hunter",
    name: "The Stakeman",
    blurb: "Tough, heavy piercing stakes.",
    maxHp: 130,
    speed: 150,
    damage: 16,
    attackInterval: 0.68,
    pierce: 1,
    artKey: "stakeman",
    /** Same layout as the hunter. A missing file uses the hunter sheet, tinted darker. */
    tintFallback: "hunter",
    sheet: {
      /** Flip on once player_sheet.png is in the folder. Off avoids a 404 while the art is still out. */
      ready: false,
      frameWidth: 80,
      frameHeight: 80,
      walkFrames: 6,
      files: [
        { image: "assets/characters/stakeman/player_sheet.png", meta: "assets/characters/stakeman/player_sheet.json" },
        { image: "assets/characters/stakeman/sheet.png", meta: "assets/characters/stakeman/sheet.json" },
      ],
    },
  },
};

export const CHARACTER_ORDER = ["hunter", "warden_hunter"];

const DEFAULT_ID = "hunter";

export function characterById(id) {
  return CHARACTERS[id] || CHARACTERS[DEFAULT_ID];
}

/** Missing or unknown ids resolve to the hunter. */
export function readCharacterId() {
  try {
    const stored = localStorage.getItem(CHARACTER_STORAGE_KEY);
    return CHARACTERS[stored] ? stored : DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

export function writeCharacterId(id) {
  const safe = characterById(id).id;
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, safe);
  } catch {
    /* private mode still plays; the choice just does not stick */
  }
  return safe;
}
