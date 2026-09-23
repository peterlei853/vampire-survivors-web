/** Survivor stats. Weapons fire from Game; this owns movement and XP. */

export function xpRequiredFor(level) {
  const n = Math.max(0, level - 1);
  return Math.round(10 + n * 6 + n * n * 0.55);
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
    this.magnetRadius = 175;
    this.pickupRadius = 22;
    this.invuln = 0;
    this.aim = 0;
  }

  update(dt, axis) {
    if (axis.x !== 0 || axis.y !== 0) {
      this.x += axis.x * this.speed * dt;
      this.y += axis.y * this.speed * dt;
      this.aim = Math.atan2(axis.y, axis.x);
    }
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
