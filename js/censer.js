/** Warding Censer: spokes sweep around the hunter and burn what they touch. */

import { drawStrip, fx } from "./fxart.js";

export const CENSER_MAX_ORBS = 4;
export const CENSER_MAX_DAMAGE = 20;
export const CENSER_MAX_RADIUS = 132;
export const CENSER_DAMAGE_STEP = 4;
export const CENSER_RADIUS_STEP = 18;

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export class Censer {
  constructor() {
    this.owned = false;
    this.orbs = 0;
    this.damage = 0;
    this.radius = 78;
    this.inner = 22;
    this.thickness = 16;
    this.hitCooldown = 0.2;
    this.angle = -Math.PI / 2;
    this.spin = 3.35;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.orbs = 1;
    this.damage = 8;
    this.radius = 78;
  }

  addOrb() {
    if (!this.owned) return;
    this.orbs = Math.min(CENSER_MAX_ORBS, this.orbs + 1);
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(CENSER_MAX_DAMAGE, this.damage + CENSER_DAMAGE_STEP);
  }

  addRadius() {
    if (!this.owned) return;
    this.radius = Math.min(CENSER_MAX_RADIUS, this.radius + CENSER_RADIUS_STEP);
  }

  advance(dt) {
    if (!this.owned) return;
    this.angle += this.spin * dt;
  }

  spokes(player) {
    const list = [];
    if (!this.owned || this.orbs <= 0) return list;
    for (let i = 0; i < this.orbs; i += 1) {
      const angle = this.angle + (i * Math.PI * 2) / this.orbs;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      list.push({
        angle,
        x0: player.x + cos * this.inner,
        y0: player.y + sin * this.inner,
        x1: player.x + cos * this.radius,
        y1: player.y + sin * this.radius,
      });
    }
    return list;
  }

  touches(enemy, spokes) {
    const reach = this.thickness + enemy.radius * 0.55;
    for (const spoke of spokes) {
      if (distToSegment(enemy.x, enemy.y, spoke.x0, spoke.y0, spoke.x1, spoke.y1) <= reach) {
        return true;
      }
    }
    return false;
  }

  draw(ctx, player, time) {
    if (!this.owned) return;
    const spokes = this.spokes(player);
    if (fx.orb) {
      for (let i = 0; i < spokes.length; i += 1) {
        const spoke = spokes[i];
        ctx.save();
        ctx.translate(spoke.x1, spoke.y1);
        drawStrip(ctx, fx.orb, 6, time * 10 + i, 18);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = "rgba(198, 214, 232, 0.16)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < spokes.length; i += 1) {
      const spoke = spokes[i];
      const trail = spoke.angle - 0.22;
      const pulse = 0.9 + Math.sin(time * 7 + i) * 0.1;
      ctx.save();
      ctx.strokeStyle = "rgba(214, 226, 240, 0.28)";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(trail) * this.inner, player.y + Math.sin(trail) * this.inner);
      ctx.lineTo(player.x + Math.cos(trail) * this.radius * 0.92, player.y + Math.sin(trail) * this.radius * 0.92);
      ctx.stroke();

      ctx.strokeStyle = "rgba(232, 240, 248, 0.72)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(spoke.x0, spoke.y0);
      ctx.lineTo(spoke.x1, spoke.y1);
      ctx.stroke();

      ctx.fillStyle = "rgba(214, 226, 240, 0.2)";
      ctx.beginPath();
      ctx.arc(spoke.x1, spoke.y1, 16 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d5e2f0";
      ctx.beginPath();
      ctx.arc(spoke.x1, spoke.y1, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4e2b8";
      ctx.beginPath();
      ctx.arc(spoke.x1, spoke.y1, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
