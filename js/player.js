/** Survivor stats. Weapons fire from Game; this owns movement, XP, and weapons. */

import { AshCross } from "./cross.js";
import { Censer } from "./censer.js";
import { Pyre } from "./pyre.js";

/** Baseline gem pull. Grave Magnet adds MAGNET_STEP up to MAGNET_MAX. */
export const MAGNET_BASE = 110;
export const MAGNET_STEP = 42;
export const MAGNET_MAX = 320;

/** Sheet row order: south, then counter-clockwise through the diagonals. */
const FACINGS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];

/** Walk cycle while the movement axis is held. Idle is column 0. */
const WALK_FPS = 10;

/**
 * The painted figure is about 52px of the 68px cell (lots of empty margin).
 * Drawing the cell at 86px, nearest-neighbor, puts her about 66px tall at
 * 1280×720: inside the 60–72px range, a little over 1× the source cell.
 * The figure is centred on the hitbox. Radius stays 14.
 */
const SPRITE_DRAW = 86;
const FIGURE_CX = 33.5;
const FIGURE_CY = 32.5;
const FIGURE_FOOT = 57;

/** 8-way index for a screen-space vector. 0 is south, then SE, E, NE, N, NW, W, SW. */
export function facingIndex(x, y) {
  const deg = Math.atan2(y, x) * (180 / Math.PI);
  const index = Math.round((90 - deg) / 45);
  return ((index % 8) + 8) % 8;
}

/**
 * XP required to leave `level`.
 * The first step is a short fight (twenty shambler gems, 40 XP).
 * Later steps bend upward so a few minutes of a denser night still levels you,
 * without the opening bar filling in the first handful of kills.
 */
export function xpRequiredFor(level) {
  const n = Math.max(0, level - 1);
  return Math.round(40 + n * 18 + n * n * 2.2);
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.speed = 168;
    this.maxHp = 100;
    this.hp = 100;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpRequiredFor(1);
    this.damage = 12;
    this.attackInterval = 0.56;
    this.attackTimer = 0;
    this.projectileSpeed = 520;
    this.projectileLife = 1.05;
    this.projectileCount = 1;
    this.pierce = 0;
    this.magnetRadius = MAGNET_BASE;
    this.magnetStacks = 0;
    this.pickupRadius = 22;
    this.invuln = 0;
    this.aim = 0;
    this.facingRow = 0;
    this.facing = FACINGS[0];
    this.walkTime = 0;
    this.moving = false;
    this.art = null;
    this.censer = new Censer();
    this.pyre = new Pyre();
    this.cross = new AshCross();
  }

  attachArt(art) {
    this.art = art && art.playerImage ? art : null;
    const name = this.art?.rows?.[this.facingRow];
    if (name) this.facing = name;
  }

  update(dt, axis) {
    const moving = axis.x !== 0 || axis.y !== 0;
    if (moving) {
      this.x += axis.x * this.speed * dt;
      this.y += axis.y * this.speed * dt;
      this.aim = Math.atan2(axis.y, axis.x);
      if (!this.moving) this.walkTime = 0;
      this.walkTime += dt;
      this.facingRow = facingIndex(axis.x, axis.y);
      this.facing = this.art?.rows?.[this.facingRow] || FACINGS[this.facingRow];
    }
    this.moving = moving;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - dt);
  }

  /** Returns each new level reached, so the game can queue upgrade picks. */
  gainXp(amount) {
    const gained = [];
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08);
      this.xpToNext = xpRequiredFor(this.level);
      gained.push(this.level);
    }
    return gained;
  }

  draw(ctx, time) {
    if (this.art?.playerImage) {
      this.drawSprite(ctx, time);
      return;
    }
    this.drawShape(ctx, time);
  }

  drawSprite(ctx, time) {
    const art = this.art;
    const image = art.playerImage;
    const frameW = art.frameWidth;
    const frameH = art.frameHeight;
    const col = this.moving
      ? 1 + (Math.floor(this.walkTime * WALK_FPS) % art.walkFrames)
      : 0;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.hp <= 0) ctx.globalAlpha = 0.45;
    else if (this.invuln > 0) ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 30);

    const scale = SPRITE_DRAW / frameW;
    const footY = (FIGURE_FOOT - FIGURE_CY) * scale;
    const shadow = ctx.createRadialGradient(0, footY, 2, 0, footY, 24);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, footY, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      image,
      col * frameW,
      this.facingRow * frameH,
      frameW,
      frameH,
      -FIGURE_CX * scale,
      -FIGURE_CY * scale,
      SPRITE_DRAW,
      SPRITE_DRAW * (frameH / frameW),
    );
    ctx.restore();
  }

  drawShape(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.hp <= 0) ctx.globalAlpha = 0.45;
    else if (this.invuln > 0) ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 30);

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(this.aim);
    ctx.fillStyle = "#6e2233";
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(-16, 12);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-16, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ecd9a4";
    ctx.fillRect(8, -1.6, 13, 3.2);
    ctx.fillStyle = "#f6f3ea";
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(17, -4);
    ctx.lineTo(17, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#e7d8c4";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#241c1e";
    ctx.stroke();

    const ex = Math.cos(this.aim) * 2.4;
    const ey = Math.sin(this.aim) * 2.4;
    ctx.fillStyle = "#1a1214";
    ctx.beginPath();
    ctx.arc(ex - 3, ey - 1, 1.5, 0, Math.PI * 2);
    ctx.arc(ex + 3, ey - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
