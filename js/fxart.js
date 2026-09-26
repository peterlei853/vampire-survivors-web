/** CC0 weapon, impact, and gem sprites. A missing image keeps the old shape. */

const FILES = {
  bolt: "light_bolt.png",
  orb: "magic_orb.png",
  fireball: "fireball.png",
  firebomb: "firebomb.png",
  spark: "explosion.png",
  cross: "grave_cross.png",
  gems: "gems.png",
};

/** Filled by applyFx after preload. Draw calls read this and fall back when null. */
export const fx = {
  bolt: null,
  orb: null,
  fireball: null,
  firebomb: null,
  spark: null,
  cross: null,
  gems: null,
};

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = url.href;
  });
}

export async function loadFx() {
  const keys = Object.keys(FILES);
  const images = await Promise.all(keys.map((key) => {
    const url = new URL(`../assets/oga/${FILES[key]}`, import.meta.url);
    return loadImage(url);
  }));
  const pack = {};
  keys.forEach((key, index) => {
    pack[key] = images[index];
  });
  return pack;
}

export function applyFx(pack) {
  for (const key of Object.keys(fx)) {
    fx[key] = pack?.[key] || null;
  }
}

/** Horizontal strip. `frame` may be fractional; the index is floored. Returns false if there is no image. */
export function drawStrip(ctx, image, frames, frame, draw, angle = 0) {
  if (!image || frames <= 0 || image.naturalWidth <= 0) return false;
  const fw = image.naturalWidth / frames;
  const fh = image.naturalHeight;
  if (fw < 1 || fh < 1) return false;
  const index = ((Math.floor(frame) % frames) + frames) % frames;
  ctx.save();
  if (angle) ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  const h = draw * (fh / fw);
  ctx.drawImage(image, index * fw, 0, fw, fh, -draw / 2, -h / 2, draw, h);
  ctx.restore();
  return true;
}

/** One cell of a uniform grid, in column-row order. */
export function drawCell(ctx, image, cols, rows, col, row, draw) {
  if (!image || cols <= 0 || rows <= 0) return false;
  const fw = image.naturalWidth / cols;
  const fh = image.naturalHeight / rows;
  if (fw < 1 || fh < 1) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, col * fw, row * fh, fw, fh, -draw / 2, -draw / 2, draw, draw);
  ctx.restore();
  return true;
}
