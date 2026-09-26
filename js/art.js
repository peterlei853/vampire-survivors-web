/** PixelLab sheet and Wang tiles. Missing images leave the shape-drawn fallback in place. */

const PLAYER_URL = new URL("../assets/player_sheet.png", import.meta.url);
const PLAYER_META_URL = new URL("../assets/player_sheet.json", import.meta.url);
const TILESET_URL = new URL("../assets/tileset.png", import.meta.url);
const TILESET_META_URL = new URL("../assets/tileset_metadata.json", import.meta.url);

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

const PATCH = 5;

function cobbleCorner(ix, iy) {
  const cx = Math.floor(ix / PATCH);
  const cy = Math.floor(iy / PATCH);
  if (hash01(cx + 19, cy - 7) > 0.18) return false;
  const lx = ix - cx * PATCH;
  const ly = iy - cy * PATCH;
  const edge = lx === 0 || ly === 0 || lx === PATCH - 1 || ly === PATCH - 1;
  if (!edge) return true;
  return hash01(ix, iy) > 0.4;
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
  constructor(image, rects) {
    this.image = image;
    this.rects = rects;
    this.tile = rects[0].w;
    this.chunks = new Map();
    this.order = [];
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
 * Resolve both images before the first frame. A failed image is null and the
 * caller keeps the previous drawing path for that layer.
 */
export async function loadArt() {
  const [playerImage, playerMeta, tilesetImage, tilesetMeta] = await Promise.all([
    loadImage(PLAYER_URL),
    loadJson(PLAYER_META_URL),
    loadImage(TILESET_URL),
    loadJson(TILESET_META_URL),
  ]);

  const rows = Array.isArray(playerMeta?.rows) && playerMeta.rows.length === 8
    ? playerMeta.rows
    : ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];

  let ground = null;
  if (tilesetImage) {
    const rects = rectsFromMeta(tilesetMeta) || FALLBACK_TILE_RECTS;
    ground = new Ground(tilesetImage, rects);
  }

  return {
    playerImage,
    tilesetImage,
    frameWidth: playerMeta?.frameWidth || 68,
    frameHeight: playerMeta?.frameHeight || 68,
    rows,
    walkFrames: playerMeta?.walkFrames || 6,
    ground,
  };
}
