/** Cross Boomerang: flies out, then returns, and cuts on both passes. Internal id stays `cross`. */

import { drawStrip, fx } from "./fxart.js";
import { drawWeapon, hasWeapon } from "./weaponart.js";

export const CROSS_MAX_COUNT = 3;
export const CROSS_MAX_DAMAGE = 22;
export const CROSS_MAX_RANGE = 320;
export const CROSS_DAMAGE_STEP = 4;
export const CROSS_RANGE_STEP = 36;

export class AshCross {
  constructor() {
    this.owned = false;
    this.count = 0;
    this.damage = 0;
    this.range = 210;
    this.interval = 1.2;
    this.timer = 0;
    this.speed = 330;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.count = 1;
    this.damage = 10;
    this.range = 210;
    this.timer = 0.2;
  }

  addCount() {
    if (!this.owned) return;
    this.count = Math.min(CROSS_MAX_COUNT, this.count + 1);
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(CROSS_MAX_DAMAGE, this.damage + CROSS_DAMAGE_STEP);
  }

  addRange() {
    if (!this.owned) return;
    this.range = Math.min(CROSS_MAX_RANGE, this.range + CROSS_RANGE_STEP);
  }
}

/** One cross in flight. `returning` homes it back to the hunter. */
export class AshBolt {
  constructor(x, y, angle, damage, speed, range) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.spin = Math.random() * Math.PI;
    this.damage = damage;
    this.speed = speed;
    this.range = range;
    this.traveled = 0;
    this.returning = false;
    this.radius = 13;
    this.life = 3.2;
    this.age = 0;
    this.cool = new Map();
  }

  update(dt, player) {
    for (const [id, left] of this.cool) {
      const next = left - dt;
      if (next <= 0) this.cool.delete(id);
      else this.cool.set(id, next);
    }
    this.spin += dt * 9;
    this.age += dt;
    const step = this.speed * dt;
    if (!this.returning) {
      this.x += Math.cos(this.angle) * step;
      this.y += Math.sin(this.angle) * step;
      this.traveled += step;
      if (this.traveled >= this.range) this.returning = true;
    } else {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= player.radius + 6) return false;
      this.angle = Math.atan2(dy, dx);
      const back = step * 1.12;
      this.x += Math.cos(this.angle) * back;
      this.y += Math.sin(this.angle) * back;
    }
    this.life -= dt;
    return this.life > 0;
  }

  ready(enemy) {
    return !this.cool.has(enemy.id);
  }

  mark(enemy) {
    this.cool.set(enemy.id, 0.26);
  }

  draw(ctx) {
    if (hasWeapon("cross", "projectile")) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.imageSmoothingEnabled = false;
      drawWeapon(ctx, "cross", "projectile", this.age, 0, 68, 104);
      ctx.restore();
      return;
    }
    if (fx.cross) {
      ctx.save();
      ctx.translate(this.x, this.y);
      drawStrip(ctx, fx.cross, 1, 0, 46, this.spin);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = "rgba(232, 210, 180, 0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-Math.cos(this.angle) * 18, -Math.sin(this.angle) * 18);
    ctx.stroke();
    ctx.rotate(this.spin);
    ctx.strokeStyle = "rgba(90, 78, 64, 0.85)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.strokeStyle = "#f3ead8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.fillStyle = "#e7a36a";
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    ctx.restore();
  }
}
