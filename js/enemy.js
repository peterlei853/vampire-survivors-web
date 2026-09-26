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
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
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
  lord: { hp: 5000, speed: 55, radius: 34, color: "#6a1028", damage: 20, xp: 0 },
};

/** Painted body height. bodyBox only scales and anchors the sprite; radius stays on the type. */
export const BODY_HEIGHT = {
  bat: 32,
  shambler: 44,
  brute: 58,
  lord: 96,
};

export const LORD_HP = 5000;
export const LORD_SPEED = 55;
export const LORD_DAMAGE = 20;
export const LORD_RADIUS = 34;
export const LORD_DASH_DAMAGE = 25;
export const LORD_DASH_DISTANCE = 400;
export const LORD_DASH_TELEGRAPH = 1;
export const LORD_MARK_RADIUS = 86;
export const LORD_MARK_WINDUP = 1.05;

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
    const flat = typeName === "lord";
    this.speed = flat
      ? LORD_SPEED
      : typeName === "bat"
        ? Math.min(BAT_SPEED_CAP, base.speed * speedScale)
        : base.speed * speedScale;
    const mult = hpMultiplier > 0 ? hpMultiplier : 1;
    this.maxHp = flat ? LORD_HP : Math.max(1, Math.round(base.hp * hpScale * mult));
    this.hp = this.maxHp;
    this.damage = flat ? LORD_DAMAGE : Math.max(1, Math.round(base.damage * dmgScale));
    this.xp = base.xp;
    this.color = base.color;
    this.hitFlash = 0;
    this.censerCd = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.animTime = 0;
    this.animPhase = Math.random();
    this.facingRow = 0;
    this.sheetAnim = "walk";
    this.knockbackImmune = flat;
    this.dashing = false;
    this.phase = "chase";
    this.specialTimer = typeName === "warden" ? 1.5 : 0;
    this.windup = 0;
    this.windupMax = 1.05;
    this.mark = null;
    this.pulse = null;
    this.pulses = [];
    if (flat) {
      this.lordPhase = 1;
      this.markTimer = 6;
      this.batTimer = 12;
      this.dashTimer = 8;
      this.cast = null;
      this.dash = null;
      this.marks = [];
    }
  }

  /** Walk cycle rate. Stays in the 8–10 fps band and picks up slightly with speed. */
  walkFps() {
    const speed = Number.isFinite(this.speed) ? this.speed : 0;
    return 8 + 2 * Math.min(1, Math.max(0, speed) / 200);
  }

  markInterval() {
    return this.lordPhase === 2 ? 4 : 6;
  }

  batRingCount() {
    return this.lordPhase === 2 ? 12 : 8;
  }

  contactDamage() {
    return this.dashing ? LORD_DASH_DAMAGE : this.damage;
  }

  update(dt, player) {
    if (this.type === "lord") {
      this.stepLordMotion(dt, player);
      return;
    }
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
    this.animTime += dt;
    if (this.type === "bat") {
      this.bob += dt * 7;
      this.x += (-dy / dist) * Math.sin(this.bob) * 36 * dt;
      this.y += (dx / dist) * Math.sin(this.bob) * 36 * dt;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.censerCd > 0) this.censerCd = Math.max(0, this.censerCd - dt);
  }

  /**
   * Scripted by Game.updateLord via advanceLord. This only moves the body:
   * hold still on the dash line, slide along it once the dash starts, and
   * chase slowly while a cast or a planted mark is winding up.
   */
  stepLordMotion(dt, player) {
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.dashing) return;
    if (this.dash?.phase === "line") {
      this.facingRow = facingIndex(this.dash.dx, this.dash.dy);
      return;
    }
    let speed = this.speed;
    const casting = Boolean(this.cast);
    const marking = this.marks?.some((mark) => mark.burst <= 0 && mark.windup > 0);
    if (casting || marking) speed *= 0.22;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dx !== 0 || dy !== 0) this.facingRow = facingIndex(dx, dy);
    this.x += (dx / dist) * speed * dt;
    this.y += (dy / dist) * speed * dt;
  }

  /** Marks, bat calls, and the dash. `game` spawns the bats so they join the cap. */
  advanceLord(dt, game) {
    this.lordPhase = this.hp <= this.maxHp * 0.5 ? 2 : 1;
    if (this.lordPhase === 2 && this.markTimer > this.markInterval()) {
      this.markTimer = this.markInterval();
    }
    this.advanceMarks(dt);
    if (this.dash) {
      this.advanceDash(dt);
      return;
    }
    if (this.cast) {
      this.advanceCast(dt, game);
      return;
    }
    this.sheetAnim = "walk";
    this.dashing = false;
    this.markTimer -= dt;
    this.batTimer -= dt;
    if (this.lordPhase === 1) this.dashTimer -= dt;
    if (this.markTimer <= 0) {
      this.markTimer += this.markInterval();
      this.beginCast("marks");
      return;
    }
    if (this.batTimer <= 0) {
      this.batTimer += 12;
      this.beginCast("bats");
      return;
    }
    if (this.lordPhase === 1 && this.dashTimer <= 0) {
      this.dashTimer += 8;
      this.beginDash(game.player);
    }
  }

  beginCast(kind) {
    this.cast = { kind, time: 0, duration: 0.75 };
    this.sheetAnim = "cast";
    this.dashing = false;
  }

  advanceCast(dt, game) {
    this.sheetAnim = "cast";
    this.cast.time += dt;
    if (this.cast.time < this.cast.duration) return;
    const kind = this.cast.kind;
    this.cast = null;
    this.sheetAnim = "walk";
    if (kind === "marks") this.plantMarks(game.player);
    if (kind === "bats") {
      game.spawnLordBats(this.batRingCount());
      if (this.lordPhase === 2) this.beginDash(game.player);
    }
  }

  /** Three planted circles. They use the warden windup and do not follow. */
  plantMarks(player) {
    const spread = 110;
    this.marks = [];
    for (let i = 0; i < 3; i += 1) {
      const angle = -Math.PI / 2 + (i - 1) * ((Math.PI * 2) / 3);
      this.marks.push({
        x: player.x + Math.cos(angle) * spread,
        y: player.y + Math.sin(angle) * spread,
        radius: LORD_MARK_RADIUS,
        windup: LORD_MARK_WINDUP,
        windupMax: LORD_MARK_WINDUP,
        burst: 0,
      });
    }
  }

  advanceMarks(dt) {
    if (!this.marks) return;
    const pending = [];
    for (const mark of this.marks) {
      if (mark.burst > 0) {
        mark.burst -= dt;
        if (mark.burst > 0) pending.push(mark);
        continue;
      }
      mark.windup -= dt;
      if (mark.windup <= 0) {
        this.pulses.push({
          x: mark.x,
          y: mark.y,
          radius: mark.radius,
          damage: this.damage + 12,
        });
        mark.burst = 0.32;
        pending.push(mark);
      } else {
        pending.push(mark);
      }
    }
    this.marks = pending;
  }

  beginDash(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.dash = {
      phase: "line",
      time: 0,
      duration: LORD_DASH_TELEGRAPH,
      dx: dx / dist,
      dy: dy / dist,
      traveled: 0,
      distance: LORD_DASH_DISTANCE,
    };
    this.dashing = false;
    this.sheetAnim = "walk";
    this.facingRow = facingIndex(dx, dy);
  }

  advanceDash(dt) {
    const dash = this.dash;
    if (!dash) return;
    if (dash.phase === "line") {
      dash.time += dt;
      this.dashing = false;
      this.sheetAnim = "walk";
      this.facingRow = facingIndex(dash.dx, dash.dy);
      if (dash.time >= dash.duration) {
        dash.phase = "go";
        this.dashing = true;
        this.sheetAnim = "dash";
      }
      return;
    }
    this.dashing = true;
    this.sheetAnim = "dash";
    this.facingRow = facingIndex(dash.dx, dash.dy);
    const speed = LORD_DASH_DISTANCE / 0.32;
    const step = Math.min(speed * dt, Math.max(0, dash.distance - dash.traveled));
    this.x += dash.dx * step;
    this.y += dash.dy * step;
    dash.traveled += step;
    if (dash.traveled >= dash.distance - 0.01) {
      this.dash = null;
      this.dashing = false;
      this.sheetAnim = "walk";
    }
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
    const sheet = this.sheetForDraw();
    if (sheet?.image && sheet.bodyBox?.w > 0 && sheet.bodyBox?.h > 0) {
      this.drawSprite(ctx, sheet);
      return;
    }
    this.drawShape(ctx, time);
  }

  sheetForDraw() {
    if (this.type === "lord") {
      const pack = enemySheets?.lord;
      return pack?.[this.sheetAnim] || pack?.walk || null;
    }
    return enemySheets?.[this.type] || null;
  }

  /**
   * bodyBox places the feet on the entity and scales the painted body to
   * BODY_HEIGHT. It does not change the collision radius.
   */
  drawSprite(ctx, sheet) {
    const box = sheet.bodyBox;
    const height = BODY_HEIGHT[this.type] || 44;
    const scale = height / box.h;
    const footX = box.x + box.w / 2;
    const footY = box.y + box.h;
    const frames = sheet.walkFrames >= 1 ? sheet.walkFrames : 1;
    const col = Math.floor((this.animTime * this.walkFps() + this.animPhase * frames) % frames);
    const image = this.hitFlash > 0 ? tintedSheet(sheet.image) : sheet.image;

    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(8, box.w * scale * 0.35), 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      image,
      col * sheet.frameWidth,
      this.facingRow * sheet.frameHeight,
      sheet.frameWidth,
      sheet.frameHeight,
      -footX * scale,
      -footY * scale,
      sheet.frameWidth * scale,
      sheet.frameHeight * scale,
    );
    ctx.restore();

    if (this.type !== "lord" && this.hp < this.maxHp) {
      const w = this.radius * 2;
      const x = this.x - w / 2;
      const y = this.y - height - 8;
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
