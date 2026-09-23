/** XP gem. Drifts toward the player inside the magnet radius. */

export class Gem {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.size = value >= 5 ? 8 : 6;
    this.color = value >= 5 ? "#e6c36a" : "#7ddec0";
    this.bob = Math.random() * Math.PI * 2;
    this.age = 0;
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
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(-this.size / 2 + 2, -this.size / 2 + 4, this.size, this.size);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}
