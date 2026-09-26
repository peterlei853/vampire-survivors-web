/** PixelLab sheet and Wang tiles, plus the CC0 weapon sprites. Missing images leave the shape-drawn fallback in place. */

import { CHARACTER_ORDER, CHARACTERS } from "./characters.js";
import { loadFx } from "./fxart.js";
const TILESET_URL = new URL("../assets/tileset.png", import.meta.url);
const TILESET_META_URL = new URL("../assets/tileset_metadata.json", import.meta.url);
const GRAVEYARD_URL = new URL("../assets/tiles/tileset_graveyard.png", import.meta.url);
const GRAVEYARD_META_URL = new URL("../assets/tiles/tileset_graveyard.json", import.meta.url);

const ENEMY_KINDS = ["bat", "shambler", "brute"];
const LORD_PARTS = ["walk", "cast", "dash"];

/**
 * Column count from a sheet JSON. Cast and dash use `frames`; walks use
 * `walkFrames`. A missing or non-numeric count is 1, never NaN.
 */
export function frameCount(meta) {
  const raw = meta?.walkFrames ?? meta?.frames;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Gravestone, candle, and shrub show up more often than bones or a buried skull. */
const DECOR_SPECS = [
  { file: "gravestone_broken.png", weight: 4 },
  { file: "candle_stub.png", weight: 4 },
  { file: "dead_shrub.png", weight: 4 },
  { file: "bones.png", weight: 1 },
  { file: "skull_buried.png", weight: 1 },
];

/** Same mix as the dotted backdrop, so patches stay put for a given world cell. */
function hash01(ix, iy) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Corner bits match the tileset metadata names (wang_0 … wang_15):
 * NW = 8, NE = 4, SW = 2, SE = 1, upper (cobblestone) sets the bit.
 * Rects below are that file's bounding boxes, used if the JSON cannot be read.
 */
const FALLBACK_TILE_RECTS = [
  { x: 64, y: 32, w: 32, h: 32 },
  { x: 96, y: 32, w: 32, h: 32 },
  { x: 64, y: 64, w: 32, h: 32 },
  { x: 32, y: 64, w: 32, h: 32 },
  { x: 64, y: 0, w: 32, h: 32 },
  { x: 96, y: 64, w: 32, h: 32 },
  { x: 0, y: 32, w: 32, h: 32 },
  { x: 96, y: 96, w: 32, h: 32 },
  { x: 32, y: 32, w: 32, h: 32 },
  { x: 64, y: 96, w: 32, h: 32 },
  { x: 32, y: 0, w: 32, h: 32 },
  { x: 0, y: 64, w: 32, h: 32 },
  { x: 96, y: 0, w: 32, h: 32 },
  { x: 0, y: 0, w: 32, h: 32 },
  { x: 32, y: 96, w: 32, h: 32 },
  { x: 0, y: 96, w: 32, h: 32 },
];

function mod(n, span) {
  return ((n % span) + span) % span;
}

/**
 * Short one-tile paths, not slabs. Most 12-tile regions stay pure dirt.
 * A path is a few cobblestone corners in a straight run so the Wang edges
 * show up as a narrow strip.
 */
function cobbleCorner(ix, iy) {
  const span = 12;
  const cx = Math.floor(ix / span);
  const cy = Math.floor(iy / span);
  if (hash01(cx + 11, cy - 4) > 0.14) return false;
  const lx = mod(ix, span);
  const ly = mod(iy, span);
  const horizontal = hash01(cx + 2, cy + 5) < 0.5;
  const along = horizontal ? lx : ly;
  const across = horizontal ? ly : lx;
  const lane = 5;
  if (across !== lane && across !== lane + 1) return false;
  const length = hash01(cx + 7, cy + 3) > 0.5 ? 5 : 4;
  return along >= 3 && along < 3 + length;
}

function wangIndex(tx, ty) {
  const nw = cobbleCorner(tx, ty) ? 8 : 0;
  const ne = cobbleCorner(tx + 1, ty) ? 4 : 0;
  const sw = cobbleCorner(tx, ty + 1) ? 2 : 0;
  const se = cobbleCorner(tx + 1, ty + 1) ? 1 : 0;
  return nw | ne | sw | se;
}

function rectsFromMeta(meta) {
  const tiles = meta?.tileset_data?.tiles;
  if (!Array.isArray(tiles)) return null;
  const rects = new Array(16);
  for (const tile of tiles) {
    const corners = tile.corners;
    const box = tile.bounding_box;
    if (!corners || !box) return null;
    const index = (corners.NW === "upper" ? 8 : 0)
      | (corners.NE === "upper" ? 4 : 0)
      | (corners.SW === "upper" ? 2 : 0)
      | (corners.SE === "upper" ? 1 : 0);
    rects[index] = {
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
    };
  }
  for (let i = 0; i < 16; i += 1) {
    if (!rects[i]) return null;
  }
  return rects;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = url.href;
  });
}

async function loadJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const CHUNK_TILES = 8;
const CHUNK_CACHE = 48;

class Ground {
  constructor(image, rects, decor = []) {
    this.image = image;
    this.rects = rects;
    this.decor = decor;
    this.tile = rects[0].w;
    this.chunks = new Map();
    this.order = [];
  }

  /**
   * About one tile in forty gets a prop. The salt is offset from the cobble
   * hash so paths and decorations do not lock to the same cells.
   */
  decorAt(ix, iy) {
    const props = this.decor;
    if (props.length === 0) return null;
    if (hash01(ix + 101, iy - 57) >= 1 / 40) return null;
    let total = 0;
    for (const prop of props) total += prop.weight;
    let roll = hash01(ix - 19, iy + 73) * total;
    for (const prop of props) {
      roll -= prop.weight;
      if (roll < 0) return prop.image;
    }
    return props[props.length - 1].image;
  }

  chunkCanvas(cx, cy) {
    const key = `${cx},${cy}`;
    const cached = this.chunks.get(key);
    if (cached) return cached;
    const tile = this.tile;
    const size = CHUNK_TILES * tile;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let ly = 0; ly < CHUNK_TILES; ly += 1) {
      for (let lx = 0; lx < CHUNK_TILES; lx += 1) {
        const index = wangIndex(cx * CHUNK_TILES + lx, cy * CHUNK_TILES + ly);
        const rect = this.rects[index];
        ctx.drawImage(
          this.image,
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          lx * tile,
          ly * tile,
          tile,
          tile,
        );
        if (index !== 0) {
          ctx.fillStyle = index === 15 ? "rgba(2, 4, 10, 0.4)" : "rgba(2, 4, 10, 0.22)";
          ctx.fillRect(lx * tile, ly * tile, tile, tile);
        }
        const prop = this.decorAt(cx * CHUNK_TILES + lx, cy * CHUNK_TILES + ly);
        if (prop) ctx.drawImage(prop, lx * tile, ly * tile, tile, tile);
      }
    }
    this.chunks.set(key, canvas);
    this.order.push(key);
    if (this.order.length > CHUNK_CACHE) {
      const oldest = this.order.shift();
      this.chunks.delete(oldest);
    }
    return canvas;
  }

  /** Screen-space. Only the chunks that overlap the view are blitted. */
  draw(ctx, camera, viewW, viewH, shakeX, shakeY) {
    const tile = this.tile;
    const chunkWorld = CHUNK_TILES * tile;
    const left = camera.x - viewW / 2 - shakeX - tile;
    const top = camera.y - viewH / 2 - shakeY - tile;
    const right = camera.x + viewW / 2 - shakeX + tile;
    const bottom = camera.y + viewH / 2 - shakeY + tile;
    const cx0 = Math.floor(left / chunkWorld);
    const cy0 = Math.floor(top / chunkWorld);
    const cx1 = Math.floor(right / chunkWorld);
    const cy1 = Math.floor(bottom / chunkWorld);
    const originX = Math.round(viewW / 2 - camera.x + shakeX);
    const originY = Math.round(viewH / 2 - camera.y + shakeY);
    ctx.imageSmoothingEnabled = false;
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        ctx.drawImage(
          this.chunkCanvas(cx, cy),
          cx * chunkWorld + originX,
          cy * chunkWorld + originY,
        );
      }
    }
  }
}

/**
 * Resolve sheets before the first frame. A failed enemy image keeps that
 * type on the circle path. A failed graveyard tileset falls back to the
 * older floor image.
 */
async function loadEnemySheet(kind) {
  const imageUrl = new URL(`../assets/enemies/${kind}_sheet.png`, import.meta.url);
  const metaUrl = new URL(`../assets/enemies/${kind}_sheet.json`, import.meta.url);
  const [image, meta] = await Promise.all([loadImage(imageUrl), loadJson(metaUrl)]);
  const body = meta?.bodyBox;
  const frameWidth = Number(meta?.frameWidth);
  const frameHeight = Number(meta?.frameHeight);
  if (!image || !body || !(body.w > 0) || !(body.h > 0)) return null;
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return null;
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return null;
  return {
    image,
    frameWidth,
    frameHeight,
    walkFrames: frameCount(meta),
    rows: Array.isArray(meta.rows) && meta.rows.length === 8 ? meta.rows : FACING_ROWS,
    bodyBox: { x: body.x, y: body.y, w: body.w, h: body.h },
    animation: meta.animation || null,
  };
}

async function loadLordSheets() {
  const entries = await Promise.all(LORD_PARTS.map(async (part) => [
    part,
    await loadEnemySheet(`lord_${part}`),
  ]));
  return Object.fromEntries(entries);
}

const FACING_ROWS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];

function sheetFrom(image, meta, defaults) {
  if (!image) return null;
  const rows = Array.isArray(meta?.rows) && meta.rows.length === 8 ? meta.rows : defaults.rows;
  const frameWidth = Number(meta?.frameWidth);
  const frameHeight = Number(meta?.frameHeight);
  const sheet = {
    image,
    frameWidth: Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : defaults.frameWidth,
    frameHeight: Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : defaults.frameHeight,
    rows,
    walkFrames: meta ? frameCount(meta) : frameCount({ walkFrames: defaults.walkFrames }),
    fallback: false,
  };
  const body = meta?.bodyBox;
  if (body && body.w > 0 && body.h > 0) {
    sheet.bodyBox = { x: body.x, y: body.y, w: body.w, h: body.h };
  }
  if (Array.isArray(meta?.columns)) sheet.columns = meta.columns.slice();
  return sheet;
}

function assetUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

/** Try each file pair on the character row. The first image that loads wins. */
async function loadCharacterArt(character) {
  const spec = character.sheet;
  if (!spec || spec.ready === false) return null;
  const defaults = {
    frameWidth: spec.frameWidth || 68,
    frameHeight: spec.frameHeight || 68,
    rows: FACING_ROWS,
    walkFrames: spec.walkFrames || 6,
  };
  for (const file of spec.files || []) {
    const [image, meta] = await Promise.all([
      loadImage(assetUrl(file.image)),
      loadJson(assetUrl(file.meta)),
    ]);
    const sheet = sheetFrom(image, meta, defaults);
    if (sheet) return sheet;
  }
  return null;
}

async function loadCharacterSheets() {
  const entries = await Promise.all(CHARACTER_ORDER.map(async (id) => [
    id,
    await loadCharacterArt(CHARACTERS[id]),
  ]));
  const sheets = Object.fromEntries(entries);
  for (const id of CHARACTER_ORDER) {
    const tint = CHARACTERS[id].tintFallback;
    if (!sheets[id] && tint && sheets[tint]) sheets[id] = darkenSheet(sheets[tint]);
  }
  return sheets;
}

/** Opaque pixels of the hunter sheet, pulled toward night so a missing body still reads as someone else. */
function darkenSheet(sheet) {
  const source = sheet.image;
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(10, 8, 16, 0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { ...sheet, image: canvas, fallback: true };
}

async function loadDecor() {
  const loaded = await Promise.all(DECOR_SPECS.map(async (spec) => {
    const image = await loadImage(new URL(`../assets/decor/${spec.file}`, import.meta.url));
    return image ? { image, weight: spec.weight } : null;
  }));
  return loaded.filter(Boolean);
}

export async function loadArt() {
  const [
    characters,
    graveyardImage,
    graveyardMeta,
    classicImage,
    classicMeta,
    enemies,
    lord,
    decor,
    fx,
  ] = await Promise.all([
    loadCharacterSheets(),
    loadImage(GRAVEYARD_URL),
    loadJson(GRAVEYARD_META_URL),
    loadImage(TILESET_URL),
    loadJson(TILESET_META_URL),
    Promise.all(ENEMY_KINDS.map(async (kind) => [kind, await loadEnemySheet(kind)])),
    loadLordSheets(),
    loadDecor(),
    loadFx(),
  ]);

  const hunterSheet = characters.hunter;
  const playerImage = hunterSheet?.image || null;
  const rows = hunterSheet?.rows || FACING_ROWS;

  let tilesetImage = null;
  let tilesetKind = null;
  let ground = null;
  const graveyardRects = graveyardImage ? rectsFromMeta(graveyardMeta) : null;
  if (graveyardImage && graveyardRects) {
    tilesetImage = graveyardImage;
    tilesetKind = "graveyard";
    ground = new Ground(graveyardImage, graveyardRects, decor);
  } else if (classicImage) {
    tilesetImage = classicImage;
    tilesetKind = "classic";
    ground = new Ground(classicImage, rectsFromMeta(classicMeta) || FALLBACK_TILE_RECTS, decor);
  }

  return {
    playerImage,
    tilesetImage,
    tilesetKind,
    enemies: { ...Object.fromEntries(enemies), lord },
    frameWidth: hunterSheet?.frameWidth || 68,
    frameHeight: hunterSheet?.frameHeight || 68,
    rows,
    walkFrames: hunterSheet?.walkFrames || 6,
    characters,
    ground,
    fx,
  };
}
