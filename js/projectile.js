/** Auto-aimed stake. `hitsLeft` is 1 plus pierce. */

import { drawStrip, fx } from "./fxart.js";

export class Projectile {
  constructor(x, y, vx, vy, damage, pierce, life) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.hitsLeft = pierce + 1;
    this.life = life;
    this.radius = 5;
    this.hitIds = new Set();
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
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
