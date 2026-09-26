/** XP gem. Drifts toward the player inside the magnet radius. */

import { drawCell, fx } from "./fxart.js";

function styleFor(value) {
  return {
    size: value >= 20 ? 13 : value >= 5 ? 8 : 6,
    color: value >= 20 ? "#fff1c2" : value >= 5 ? "#e6c36a" : "#7ddec0",
    rich: value >= 20,
  };
}

export class Gem {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    const style = styleFor(value);
    this.size = style.size;
    this.color = style.color;
    this.rich = style.rich;
    this.bob = Math.random() * Math.PI * 2;
    this.age = 0;
  }

  /** Fold more XP into this gem so a cull never throws the value away. */
  addValue(amount) {
    if (!amount) return;
    this.value += amount;
    const style = styleFor(this.value);
    this.size = style.size;
    this.color = style.color;
    this.rich = style.rich;
  }

  update(dt, player) {
    this.bob += dt * 3;
    this.age += dt;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    let pull = 0;
    if (dist < player.magnetRadius) {
      const closeness = 1 - dist / player.magnetRadius;
      pull = 340 + closeness * 680;
    } else if (this.age > 1.1) {
      // Stray gems eventually catch a kiting player instead of vanishing off the route.
      pull = Math.min(player.speed + 90, 140 + (this.age - 1.1) * 220);
    }
    if (pull > 0) {
      this.x += (dx / dist) * pull * dt;
      this.y += (dy / dist) * pull * dt;
    }
  }

  collectedBy(player) {
    return Math.hypot(player.x - this.x, player.y - this.y) <= player.pickupRadius + this.size;
  }

  draw(ctx) {
    const bob = Math.sin(this.bob) * 2;
    if (fx.gems) {
      const col = this.rich ? 0 : this.value >= 5 ? 2 : 1;
      const row = this.rich ? 2 : this.value >= 5 ? 1 : 0;
      const draw = this.rich ? 16 : this.value >= 5 ? 16 : 14;
      ctx.save();
      ctx.translate(this.x, this.y + bob);
      drawCell(ctx, fx.gems, 3, 3, col, row, draw);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(Math.PI / 4);
    if (this.rich) {
      ctx.fillStyle = "rgba(255, 214, 120, 0.28)";
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(-this.size / 2 + 2, -this.size / 2 + 4, this.size, this.size);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}
