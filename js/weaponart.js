/** Pixel-art weapon strips. `imageSmoothingEnabled` stays off so the pixels stay square. */

const CACHE = new Map();

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = url.href;
  });
}

const IDS = [
  "stake",
  "crossbow",
  "dagger",
  "whip",
  "scythe",
  "torch",
  "tome",
  "cross",
  "pyre",
  "censer",
];

/** Load every `weapon.json` and the strips it names. A missing file is skipped. */
export async function loadWeaponArt() {
  await Promise.all(IDS.map(async (id) => {
    const base = new URL(`../assets/weapons/${id}/`, import.meta.url);
    let meta = null;
    try {
      const response = await fetch(new URL("weapon.json", base));
      if (response.ok) meta = await response.json();
    } catch {
      meta = null;
    }
    const files = {};
    for (const file of meta?.files || []) {
      const image = await loadImage(new URL(file.file, base));
      if (!image) continue;
      const spec = {
        image,
        frameWidth: file.frameWidth || image.naturalWidth,
        frameHeight: file.frameHeight || image.naturalHeight,
        frames: file.frames || 1,
        fps: file.fps || 0,
        facing: file.facing || "none",
        role: file.role,
      };
      if (!files[file.role] || file.primary) files[file.role] = spec;
    }
    CACHE.set(id, files);
  }));
}

export function hasWeapon(id, role) {
  return Boolean(CACHE.get(id)?.[role]?.image);
}

/**
 * Draw one cell of a strip.
 * facing "east" rotates to `angle` (travel). facing "none" plays the strip and does not turn.
 * `drawW` / `drawH` default to the cell size. Pass both to stretch (whip, aura, pool).
 */
export function drawWeapon(ctx, id, role, time, angle = 0, drawW = null, drawH = null) {
  const spec = CACHE.get(id)?.[role];
  if (!spec?.image) return false;
  const frames = Math.max(1, spec.frames | 0);
  const fw = spec.frameWidth;
  const fh = spec.frameHeight;
  if (fw < 1 || fh < 1) return false;
  let index = 0;
  if (frames > 1 && spec.fps > 0) {
    index = Math.floor(Math.max(0, time) * spec.fps) % frames;
  }
  const w = drawW ?? fw;
  const h = drawH ?? fh;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (spec.facing === "east") ctx.rotate(angle || 0);
  ctx.drawImage(spec.image, index * fw, 0, fw, fh, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
