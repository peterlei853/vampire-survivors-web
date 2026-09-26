/** Chasers. Spawn stats scale slightly with elapsed night time. */

import { facingIndex } from "./player.js";

let nextId = 1;

/** Sheets from loadArt. A missing image keeps the circle for that type. */
let enemySheets = null;

const flashCopies = new WeakMap();

export function bindEnemyArt(sheets) {
  enemySheets = sheets || null;
}

/** One white copy per sheet. source-atop keeps the sprite's alpha. */
function tintedSheet(image) {
  const cached = flashCopies.get(image);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  flashCopies.set(image, canvas);
  return canvas;
}

export const ENEMY_TYPES = {
  shambler: { hp: 18, speed: 78, radius: 13, color: "#c15a3e", damage: 8, xp: 2 },
  bat: { hp: 10, speed: 196, radius: 10, color: "#8a56b0", damage: 7, xp: 2 },
  brute: { hp: 84, speed: 48, radius: 20, color: "#7a3034", damage: 16, xp: 5 },
  warden: { hp: 280, speed: 56, radius: 26, color: "#8e243f", damage: 14, xp: 0 },
};

/** Absolute chase-speed cap, tuned against base move speed 168, not current speed. */
export const BAT_SPEED_CAP = 200;

export class Enemy {
  constructor(typeName, x, y, time, hpMultiplier = 1) {
    const base = ENEMY_TYPES[typeName] || ENEMY_TYPES.shambler;
    const hpScale = 1 + Math.max(0, time - 30) / 220;
    const speedScale = 1 + Math.min(0.5, Math.max(0, time - 40) / 220);
    const dmgScale = 1 + Math.max(0, time - 45) / 200;
    this.id = nextId++;
    this.type = typeName;
    this.x = x;
    this.y = y;
    this.radius = base.radius;
    this.speed = typeName === "bat"
      ? Math.min(BAT_SPEED_CAP, base.speed * speedScale)
      : base.speed * speedScale;
    const mult = hpMultiplier > 0 ? hpMultiplier : 1;
    this.maxHp = Math.max(1, Math.round(base.hp * hpScale * mult));
    this.hp = this.maxHp;
    this.damage = Math.max(1, Math.round(base.damage * dmgScale));
    this.xp = base.xp;
    this.color = base.color;
    this.hitFlash = 0;
    this.censerCd = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.facingRow = 0;
    this.phase = "chase";
    this.specialTimer = typeName === "warden" ? 1.5 : 0;
    this.windup = 0;
    this.windupMax = 1.05;
    this.mark = null;
    this.pulse = null;
  }

  update(dt, player) {
    let speed = this.speed;
    if (this.type === "warden") {
      this.stepWarden(dt, player);
      if (this.phase === "windup") speed *= 0.22;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dx !== 0 || dy !== 0) this.facingRow = facingIndex(dx, dy);
    this.x += (dx / dist) * speed * dt;
    this.y += (dy / dist) * speed * dt;
    this.bob += dt * (this.type === "bat" ? 7 : 3);
    if (this.type === "bat") {
      this.x += (-dy / dist) * Math.sin(this.bob) * 36 * dt;
      this.y += (dx / dist) * Math.sin(this.bob) * 36 * dt;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.censerCd > 0) this.censerCd = Math.max(0, this.censerCd - dt);
  }

  /**
   * The warden plants a circle on the hunter and waits.
   * The circle does not follow. Leaving it is the whole tell.
   */
  stepWarden(dt, player) {
    if (this.phase === "chase") {
      this.specialTimer -= dt;
      if (this.specialTimer <= 0) {
        this.phase = "windup";
        this.windupMax = 1.05;
        this.windup = this.windupMax;
        this.mark = { x: player.x, y: player.y, radius: 86, burst: 0 };
      }
    } else if (this.phase === "windup") {
      this.windup -= dt;
      if (this.windup <= 0 && this.mark) {
        this.pulse = {
          x: this.mark.x,
          y: this.mark.y,
          radius: this.mark.radius,
          damage: this.damage + 12,
        };
        this.mark.burst = 0.32;
        this.phase = "chase";
        this.specialTimer = 2.7;
      }
    }
    if (this.mark && this.mark.burst > 0) {
      this.mark.burst -= dt;
      if (this.mark.burst <= 0 && this.phase !== "windup") this.mark = null;
    }
  }

  draw(ctx, time) {
    if (this.type === "warden") {
      this.drawWarden(ctx, time);
      return;
    }
    const sheet = enemySheets?.[this.type];
    if (sheet?.image && sheet.bodyBox?.w > 0) {
      this.drawSprite(ctx, sheet);
      return;
    }
    this.drawShape(ctx, time);
  }

  /**
   * bodyBox width maps onto the hit diameter so the painted body lines up
   * with the old circle. The body-box centre sits on the collision point.
   * walkFrames is 1, so a short vertical bob stands in for a cycle.
   */
  drawSprite(ctx, sheet) {
    const box = sheet.bodyBox;
    const scale = (this.radius * 2) / box.w;
    const bob = Math.sin(this.bob) * 2.5;
    const bodyCx = box.x + box.w / 2;
    const bodyCy = box.y + box.h / 2;
    const image = this.hitFlash > 0 ? tintedSheet(sheet.image) : sheet.image;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.imageSmoothingEnabled = false;

    const footY = (box.h / 2) * scale;
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(0, footY, this.radius * 0.85, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      image,
      0,
      this.facingRow * sheet.frameHeight,
      sheet.frameWidth,
      sheet.frameHeight,
      -bodyCx * scale,
      -bodyCy * scale + bob,
      sheet.frameWidth * scale,
      sheet.frameHeight * scale,
    );
    ctx.restore();

    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      const x = this.x - w / 2;
      const y = this.y + bob - footY - 8;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = "#e15b55";
      ctx.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 3);
    }
  }

  drawShape(ctx, time) {
    const flash = this.hitFlash > 0;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.75, this.radius * 0.8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.type === "bat") {
      const flap = Math.sin(time * 16 + this.id) * 5;
      ctx.fillStyle = flash ? "#f4f1ea" : "#3c2554";
      ctx.beginPath();
      ctx.ellipse(-this.radius, flap, this.radius * 0.85, 3.5, -0.5, 0, Math.PI * 2);
      ctx.ellipse(this.radius, -flap, this.radius * 0.85, 3.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.type === "brute") {
      ctx.fillStyle = flash ? "#f4f1ea" : "#3d181c";
      ctx.beginPath();
      ctx.moveTo(-6, -this.radius + 4);
      ctx.lineTo(-12, -this.radius - 8);
      ctx.lineTo(-1, -this.radius + 2);
      ctx.moveTo(6, -this.radius + 4);
      ctx.lineTo(12, -this.radius - 8);
      ctx.lineTo(1, -this.radius + 2);
      ctx.fill();
    }

    ctx.fillStyle = flash ? "#f7f3ea" : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();

    ctx.fillStyle = "#140c0c";
    ctx.beginPath();
    ctx.arc(-4, -2, this.type === "brute" ? 2.4 : 1.7, 0, Math.PI * 2);
    ctx.arc(4, -2, this.type === "brute" ? 2.4 : 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      const x = this.x - w / 2;
      const y = this.y - this.radius - 8;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = "#e15b55";
      ctx.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 3);
    }
  }

  drawWarden(ctx, time) {
    const flash = this.hitFlash > 0;
    const pulse = 0.85 + Math.sin(time * 4) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.85, this.radius, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? "#f4f1ea" : "#2a1018";
    ctx.beginPath();
    ctx.ellipse(0, 6, this.radius * 0.95, this.radius * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? "#f7f3ea" : this.color;
    ctx.beginPath();
    ctx.arc(0, -2, this.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.stroke();

    ctx.fillStyle = flash ? "#fff6e4" : `rgba(230, 195, 106, ${pulse})`;
    ctx.beginPath();
    ctx.moveTo(-14, -this.radius * 0.5);
    ctx.lineTo(-10, -this.radius - 6);
    ctx.lineTo(-4, -this.radius * 0.28);
    ctx.lineTo(0, -this.radius - 12);
    ctx.lineTo(4, -this.radius * 0.28);
    ctx.lineTo(10, -this.radius - 6);
    ctx.lineTo(14, -this.radius * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#140c0c";
    ctx.beginPath();
    ctx.arc(-5, -4, 2.2, 0, Math.PI * 2);
    ctx.arc(5, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#ffd2cc";
    ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WARDEN", this.x, this.y - this.radius - 20);
    ctx.restore();

    const w = this.radius * 2.4;
    const x = this.x - w / 2;
    const y = this.y - this.radius - 12;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = "#e6c36a";
    ctx.fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 5);
  }
}
