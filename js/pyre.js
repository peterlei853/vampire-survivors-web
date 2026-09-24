/** Cinder Pyre: flasks arc onto foes and leave a pool that keeps burning. */

export const PYRE_MAX_CHARGES = 3;
export const PYRE_MAX_DAMAGE = 12;
export const PYRE_MAX_RADIUS = 78;
export const PYRE_DAMAGE_STEP = 2;
export const PYRE_RADIUS_STEP = 12;

export class Pyre {
  constructor() {
    this.owned = false;
    this.charges = 0;
    this.damage = 0;
    this.radius = 46;
    this.interval = 1.75;
    this.timer = 0;
    this.duration = 2.05;
    this.tick = 0.32;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.charges = 1;
    this.damage = 5;
    this.radius = 46;
    this.timer = 0.3;
  }

  addCharge() {
    if (!this.owned) return;
    this.charges = Math.min(PYRE_MAX_CHARGES, this.charges + 1);
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(PYRE_MAX_DAMAGE, this.damage + PYRE_DAMAGE_STEP);
  }

  addRadius() {
    if (!this.owned) return;
    this.radius = Math.min(PYRE_MAX_RADIUS, this.radius + PYRE_RADIUS_STEP);
  }
}

/** A flask in the air. When it lands, the game plants a pool at the target. */
export class PyreFlask {
  constructor(x, y, tx, ty, spec) {
    this.x = x;
    this.y = y;
    this.sx = x;
    this.sy = y;
    this.tx = tx;
    this.ty = ty;
    this.life = 0.28;
    this.max = 0.28;
    this.spec = spec;
  }

  update(dt) {
    this.life -= dt;
    const t = 1 - Math.max(0, this.life) / this.max;
    this.x = this.sx + (this.tx - this.sx) * t;
    this.y = this.sy + (this.ty - this.sy) * t - Math.sin(t * Math.PI) * 26;
  }

  done() {
    return this.life <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#ffb15a";
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = "#fff1c9";
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
}

/** Lingering fire. Each foe inside takes damage on a cooldown. */
export class PyrePool {
  constructor(x, y, radius, damage, duration, tick) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.life = duration;
    this.max = duration;
    this.tick = tick;
    this.cool = new Map();
  }

  update(dt) {
    this.life -= dt;
    for (const [id, left] of this.cool) {
      const next = left - dt;
      if (next <= 0) this.cool.delete(id);
      else this.cool.set(id, next);
    }
  }

  ready(enemy) {
    return !this.cool.has(enemy.id);
  }

  mark(enemy) {
    this.cool.set(enemy.id, this.tick);
  }

  draw(ctx, time) {
    const fade = Math.max(0, this.life / this.max);
    const breathe = 0.92 + Math.sin(time * 8) * 0.06;
    ctx.save();
    ctx.translate(this.x, this.y + 4);
    ctx.fillStyle = `rgba(255, 78, 32, ${0.18 * fade})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * breathe, this.radius * 0.52 * breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 186, 96, ${0.55 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 0.78 * breathe, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 220, 160, ${0.4 * fade})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 0.28, this.radius * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
