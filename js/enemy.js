/** Chasers. Spawn stats scale slightly with elapsed night time. */

let nextId = 1;

export const ENEMY_TYPES = {
  shambler: { hp: 18, speed: 78, radius: 13, color: "#c15a3e", damage: 8, xp: 2 },
  bat: { hp: 10, speed: 196, radius: 10, color: "#8a56b0", damage: 7, xp: 2 },
  brute: { hp: 84, speed: 48, radius: 20, color: "#7a3034", damage: 16, xp: 5 },
};

export class Enemy {
  constructor(typeName, x, y, time) {
    const base = ENEMY_TYPES[typeName] || ENEMY_TYPES.shambler;
    const hpScale = 1 + time / 75;
    const speedScale = 1 + Math.min(0.55, time / 200);
    const dmgScale = 1 + time / 170;
    this.id = nextId++;
    this.type = typeName;
    this.x = x;
    this.y = y;
    this.radius = base.radius;
    this.speed = base.speed * speedScale;
    this.maxHp = Math.max(1, Math.round(base.hp * hpScale));
    this.hp = this.maxHp;
    this.damage = Math.max(1, Math.round(base.damage * dmgScale));
    this.xp = base.xp;
    this.color = base.color;
    this.hitFlash = 0;
    this.bob = Math.random() * Math.PI * 2;
  }

  update(dt, player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.x += (dx / dist) * this.speed * dt;
    this.y += (dy / dist) * this.speed * dt;
    this.bob += dt * (this.type === "bat" ? 7 : 3);
    if (this.type === "bat") {
      this.x += (-dy / dist) * Math.sin(this.bob) * 36 * dt;
      this.y += (dx / dist) * Math.sin(this.bob) * 36 * dt;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  draw(ctx, time) {
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
}
