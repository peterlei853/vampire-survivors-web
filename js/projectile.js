/** Auto-aimed stake or crossbow bolt, and thrown daggers. `hitsLeft` is 1 plus pierce. */

import { drawStrip, fx } from "./fxart.js";
import { drawWeapon, hasWeapon } from "./weaponart.js";

export class Projectile {
  constructor(x, y, vx, vy, damage, pierce, life, kind = "stake") {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.hitsLeft = pierce + 1;
    this.life = life;
    this.radius = kind === "crossbow" ? 7 : 5;
    this.hitIds = new Set();
    this.kind = kind;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    if (hasWeapon(this.kind, "projectile")) {
      const frame = this.kind === "dagger" ? 62 : this.kind === "crossbow" ? 54 : 50;
      const tall = this.kind === "dagger" ? 62 : 32;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.imageSmoothingEnabled = false;
      drawWeapon(ctx, this.kind, "projectile", this.age, angle, frame, tall);
      ctx.restore();
      return;
    }
    if (fx.bolt) {
      ctx.save();
      ctx.translate(this.x, this.y);
      drawStrip(ctx, fx.bolt, 6, -this.life * 12, 32, angle);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(255, 214, 140, 0.35)";
    ctx.fillRect(-16, -2, 14, 4);
    ctx.fillStyle = "#ffe7a8";
    ctx.fillRect(-6, -2, 14, 4);
    ctx.fillStyle = "#fff8e4";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(6, -3.5);
    ctx.lineTo(6, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
