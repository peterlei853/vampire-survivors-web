/** World loop: spawn, chase, stake, censer, pyre, cross, warden, gems, level-up, camera. */

import { AudioBus } from "./audio.js";
import { applyFx, drawStrip, FX, fx } from "./fxart.js";
import { BossUI } from "./ui/boss.js";
import {
  CENSER_DAMAGE_STEP,
  CENSER_MAX_DAMAGE,
  CENSER_MAX_ORBS,
  CENSER_MAX_RADIUS,
  CENSER_RADIUS_STEP,
} from "./censer.js";
import {
  CROSS_DAMAGE_STEP,
  CROSS_MAX_COUNT,
  CROSS_MAX_DAMAGE,
  CROSS_MAX_RANGE,
  CROSS_RANGE_STEP,
  AshBolt,
} from "./cross.js";
import { characterById } from "./characters.js";
import { bindEnemyArt, Enemy } from "./enemy.js";
import { Gem } from "./gem.js";
import { MAGNET_MAX, MAGNET_STEP, Player } from "./player.js";
import { Projectile } from "./projectile.js";
import {
  PYRE_DAMAGE_STEP,
  PYRE_MAX_CHARGES,
  PYRE_MAX_DAMAGE,
  PYRE_MAX_RADIUS,
  PYRE_RADIUS_STEP,
  PyreFlask,
  PyrePool,
} from "./pyre.js";

/** Warning never starts before this. The body arrives one telegraph later. */
export const ELITE_MIN_TIME = 90;
/** Quiet runs meet the warden here, still inside the 90–120s window. */
export const ELITE_TIME = 100;
/** A kill-heavy run can meet the first warden as soon as the window opens. */
export const ELITE_KILLS = 80;
export const ELITE_WARN = 2.4;
/** Later wardens are on a fixed clock: 220, 340, 460, … (100 + n×120). */
export const ELITE_INTERVAL = 120;
/** Each later warden multiplies base HP by this, then the night's time scale. */
export const WARDEN_HP_MULT = 1.5;
/** Surviving this long ends the night. */
export const DAWN_TIME = 600;
/** The Vampire Lord replaces the warden that used to arrive at 580s. */
export const LORD_TIME = 540;
/** Warning banner length. He lands when this elapses. Matches BossUI. */
export const LORD_ENTRANCE = 1.6;
export const SUPPRESSED_WARDEN_TIME = 580;
const HASTE_FLOOR = 0.25;
const CAP_AT_4 = 4 * 60;
const CAP_AT_6 = 6 * 60;

/**
 * First warden still uses the v0.5.0 window (90s at 80 kills, otherwise 100s).
 * Appearance 1, 2, 3… are due at 220, 340, 460… regardless of kills.
 */
export function eliteDue(time, kills, appearance = 0) {
  const n = Math.max(0, appearance);
  if (n > 0) return time >= ELITE_TIME + n * ELITE_INTERVAL;
  if (time < ELITE_MIN_TIME) return false;
  return time >= ELITE_TIME || kills >= ELITE_KILLS;
}

const UPGRADES = [
  {
    id: "damage",
    name: "Sharpened Stake",
    blurb: "Each bolt bites deeper.",
    detail(player) {
      const next = Math.round(player.damage * 1.2);
      return `Damage ${player.damage} → ${next}`;
    },
    apply(player) {
      player.damage = Math.round(player.damage * 1.2);
    },
  },
  {
    id: "haste",
    name: "Hasty Ritual",
    blurb: "The stake flies more often.",
    maxed: (player) => player.attackInterval <= HASTE_FLOOR + 1e-6,
    detail(player) {
      const next = Math.max(HASTE_FLOOR, player.attackInterval * 0.88);
      return `Attack every ${player.attackInterval.toFixed(2)}s → ${next.toFixed(2)}s`;
    },
    apply(player) {
      player.attackInterval = Math.max(HASTE_FLOOR, player.attackInterval * 0.88);
    },
  },
  {
    id: "speed",
    name: "Fleet Foot",
    blurb: "Cover more of the field.",
    maxed: (player) => player.speed >= 400,
    detail(player) {
      const next = Math.min(400, Math.round(player.speed * 1.1));
      return `Move speed ${Math.round(player.speed)} → ${next}`;
    },
    apply(player) {
      player.speed = Math.min(400, Math.round(player.speed * 1.1));
    },
  },
  {
    id: "vigor",
    name: "Sanguine Vigour",
    blurb: "A deeper well of blood, and some of it back.",
    detail(player) {
      return `Max HP ${player.maxHp} → ${player.maxHp + 25}, heal 25`;
    },
    apply(player) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
  {
    id: "bolts",
    name: "Twin Bolts",
    blurb: "Loose another stake at the same time.",
    maxed: (player) => player.projectileCount >= 5,
    detail(player) {
      return `Bolts ${player.projectileCount} → ${player.projectileCount + 1}`;
    },
    apply(player) {
      player.projectileCount += 1;
    },
  },
  {
    id: "magnet",
    name: "Grave Magnet",
    blurb: "Gems rush in from farther away.",
    family: "magnet",
    maxed: (player) => player.magnetRadius >= MAGNET_MAX,
    detail(player) {
      const next = Math.min(MAGNET_MAX, player.magnetRadius + MAGNET_STEP);
      return `Pull radius ${player.magnetRadius} → ${next}`;
    },
    apply(player) {
      player.magnetRadius = Math.min(MAGNET_MAX, player.magnetRadius + MAGNET_STEP);
      player.magnetStacks += 1;
    },
  },
  {
    id: "pierce",
    name: "Piercing Ash",
    blurb: "Bolts pass through another foe.",
    maxed: (player) => player.pierce >= 3,
    detail(player) {
      return `Extra targets ${player.pierce} → ${player.pierce + 1}`;
    },
    apply(player) {
      player.pierce += 1;
    },
  },
  {
    id: "censer",
    name: "Warding Censer",
    blurb: "A silver censer wakes and sweeps the dark around you.",
    family: "censer",
    available: (player) => !player.censer.owned,
    weight: () => 5,
    detail() {
      return "Unlock an orbiting censer (8 damage)";
    },
    apply(player) {
      player.censer.unlock();
    },
  },
  {
    id: "censer-orbs",
    name: "Another Censer",
    blurb: "Another lamp joins the sweep.",
    family: "censer",
    available: (player) => player.censer.owned,
    maxed: (player) => player.censer.orbs >= CENSER_MAX_ORBS,
    detail(player) {
      return `Censers ${player.censer.orbs} → ${player.censer.orbs + 1}`;
    },
    apply(player) {
      player.censer.addOrb();
    },
  },
  {
    id: "censer-heat",
    name: "Hot Ash",
    blurb: "The censers burn hotter as they pass.",
    family: "censer",
    available: (player) => player.censer.owned,
    maxed: (player) => player.censer.damage >= CENSER_MAX_DAMAGE,
    detail(player) {
      const next = Math.min(CENSER_MAX_DAMAGE, player.censer.damage + CENSER_DAMAGE_STEP);
      return `Censer damage ${player.censer.damage} → ${next}`;
    },
    apply(player) {
      player.censer.addDamage();
    },
  },
  {
    id: "censer-reach",
    name: "Wider Vigil",
    blurb: "The sweep reaches farther from your side.",
    family: "censer",
    available: (player) => player.censer.owned,
    maxed: (player) => player.censer.radius >= CENSER_MAX_RADIUS,
    detail(player) {
      const next = Math.min(CENSER_MAX_RADIUS, player.censer.radius + CENSER_RADIUS_STEP);
      return `Sweep reach ${player.censer.radius} → ${next}`;
    },
    apply(player) {
      player.censer.addRadius();
    },
  },
  {
    id: "pyre",
    name: "Cinder Pyre",
    blurb: "A flask bursts on the nearest foe and keeps burning.",
    family: "pyre",
    available: (player) => !player.pyre.owned,
    weight: () => 5,
    detail() {
      return "Unlock a pyre pool (5 damage a tick)";
    },
    apply(player) {
      player.pyre.unlock();
    },
  },
  {
    id: "pyre-charges",
    name: "Another Flask",
    blurb: "Another flask leaves the hand with the first.",
    family: "pyre",
    available: (player) => player.pyre.owned,
    maxed: (player) => player.pyre.charges >= PYRE_MAX_CHARGES,
    detail(player) {
      return `Flasks ${player.pyre.charges} → ${player.pyre.charges + 1}`;
    },
    apply(player) {
      player.pyre.addCharge();
    },
  },
  {
    id: "pyre-heat",
    name: "Hotter Pitch",
    blurb: "The pool bites harder each time it flares.",
    family: "pyre",
    available: (player) => player.pyre.owned,
    maxed: (player) => player.pyre.damage >= PYRE_MAX_DAMAGE,
    detail(player) {
      const next = Math.min(PYRE_MAX_DAMAGE, player.pyre.damage + PYRE_DAMAGE_STEP);
      return `Pyre damage ${player.pyre.damage} → ${next}`;
    },
    apply(player) {
      player.pyre.addDamage();
    },
  },
  {
    id: "pyre-reach",
    name: "Wider Pyre",
    blurb: "The fire spreads farther from where the flask lands.",
    family: "pyre",
    available: (player) => player.pyre.owned,
    maxed: (player) => player.pyre.radius >= PYRE_MAX_RADIUS,
    detail(player) {
      const next = Math.min(PYRE_MAX_RADIUS, player.pyre.radius + PYRE_RADIUS_STEP);
      return `Pool radius ${player.pyre.radius} → ${next}`;
    },
    apply(player) {
      player.pyre.addRadius();
    },
  },
  {
    id: "cross",
    name: "Ash Cross",
    blurb: "A cross flies out and cuts again on the way home.",
    family: "cross",
    available: (player) => !player.cross.owned,
    weight: () => 5,
    detail() {
      return "Unlock a returning cross (10 damage)";
    },
    apply(player) {
      player.cross.unlock();
    },
  },
  {
    id: "cross-count",
    name: "Another Cross",
    blurb: "Another cross leaves with the first.",
    family: "cross",
    available: (player) => player.cross.owned,
    maxed: (player) => player.cross.count >= CROSS_MAX_COUNT,
    detail(player) {
      return `Crosses ${player.cross.count} → ${player.cross.count + 1}`;
    },
    apply(player) {
      player.cross.addCount();
    },
  },
  {
    id: "cross-heat",
    name: "Heavier Ash",
    blurb: "The cross bites deeper on both passes.",
    family: "cross",
    available: (player) => player.cross.owned,
    maxed: (player) => player.cross.damage >= CROSS_MAX_DAMAGE,
    detail(player) {
      const next = Math.min(CROSS_MAX_DAMAGE, player.cross.damage + CROSS_DAMAGE_STEP);
      return `Cross damage ${player.cross.damage} → ${next}`;
    },
    apply(player) {
      player.cross.addDamage();
    },
  },
  {
    id: "cross-reach",
    name: "Longer Flight",
    blurb: "The cross travels farther before it turns back.",
    family: "cross",
    available: (player) => player.cross.owned,
    maxed: (player) => player.cross.range >= CROSS_MAX_RANGE,
    detail(player) {
      const next = Math.min(CROSS_MAX_RANGE, player.cross.range + CROSS_RANGE_STEP);
      return `Flight ${player.cross.range} → ${next}`;
    },
    apply(player) {
      player.cross.addRange();
    },
  },
];

function rollUpgrades(player, count) {
  const pool = UPGRADES.filter((upgrade) => {
    if (upgrade.available && !upgrade.available(player)) return false;
    if (upgrade.maxed && upgrade.maxed(player)) return false;
    return true;
  }).map((upgrade) => ({
    upgrade,
    weight: upgrade.weight ? upgrade.weight(player) : 1,
  }));

  const picks = [];
  while (picks.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picks.push(pool[index].upgrade);
    pool.splice(index, 1);
  }
  // Keep each locked weapon on the table until the player actually takes it.
  // Unshift cross, then pyre, then the censer, so the censer stays in front.
  const pinned = ["cross", "pyre", "censer"];
  for (const id of pinned) {
    const unlock = UPGRADES.find((upgrade) => upgrade.id === id);
    if (!unlock) continue;
    if (unlock.available && !unlock.available(player)) continue;
    if (unlock.maxed && unlock.maxed(player)) continue;
    if (picks.some((upgrade) => upgrade.id === id)) continue;
    picks.unshift(unlock);
  }
  const pinIds = new Set(pinned);
  while (picks.length > count) {
    let removed = false;
    for (let i = picks.length - 1; i >= 0; i -= 1) {
      const upgrade = picks[i];
      const stillPinned = pinIds.has(upgrade.id)
        && (!upgrade.available || upgrade.available(player));
      if (stillPinned) continue;
      picks.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) {
      picks.length = count;
      break;
    }
  }
  return picks;
}

/**
 * How hard the night is pushing.
 * Time does most of the work and eases in, so the first seconds stay sparse.
 * Kills add a smaller nudge (capped) so a strong run sees a thicker night
 * without an early death spiral.
 *
 * Rough shape with a normal kill pace: near 0 through the first half-minute,
 * still gentle at one minute, then climbing hard by two minutes.
 */
export function nightThreat(time, kills) {
  const minutes = Math.max(0, time) / 60;
  const fromTime = minutes * 0.28 + Math.max(0, minutes - 0.75) ** 2 * 1.35;
  const fromKills = Math.min(1.1, Math.max(0, kills) / 220) * 0.35;
  return fromTime + fromKills;
}

export function spawnIntervalFor(time, kills) {
  return Math.max(0.32, 1.7 / (1 + nightThreat(time, kills) * 0.5));
}

export function spawnBatchCap(time) {
  if (time < CAP_AT_4) return 5;
  if (time < CAP_AT_6) return 6;
  return 7;
}

export function spawnCountFor(time, kills) {
  return Math.min(spawnBatchCap(time), 1 + Math.floor(nightThreat(time, kills) / 1.5));
}

export function enemyCapCeiling(time) {
  if (time < CAP_AT_4) return 140;
  if (time < CAP_AT_6) return 180;
  return 220;
}

export function maxEnemiesFor(time, kills) {
  return Math.min(enemyCapCeiling(time), Math.round(12 + nightThreat(time, kills) * 14));
}

function hash01(ix, iy) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

class Spark {
  constructor(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 110;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 0.35 + Math.random() * 0.15;
    this.max = this.life;
    this.color = color;
    this.radius = 1.5 + Math.random() * 2;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.max);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    const frame = (1 - alpha) * 4;
    if (!drawStrip(ctx, fx.spark, 5, frame, 20)) {
      ctx.fillStyle = this.color;
      ctx.fillRect(0, 0, this.radius, this.radius);
    }
    ctx.restore();
  }
}

class Popup {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.65;
    this.max = 0.65;
  }

  update(dt) {
    this.y -= 32 * dt;
    this.life -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / this.max);
    ctx.fillStyle = this.color;
    ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export class Game {
  constructor(canvas, input, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.ui = ui;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.audio = new AudioBus();
    this.art = null;
    this.sprites = {
      player: null,
      tileset: null,
      enemies: { bat: null, shambler: null, brute: null, lord: null },
    };
    this.dpr = 1;
    this.viewW = 800;
    this.viewH = 600;
    this.anim = 0;
    this.lastDt = 0;
    this.lastTs = null;
    this.showPerf = false;
    this.fps = 0;
    this.fpsFrames = 0;
    this.fpsWindowStart = null;
    this.characterId = null;
    this.select = null;
    FX.onBoss = (name) => this.onBossFx(name);
    this.resetWorld();
    this.state = "menu";
  }

  /** Called once images have settled, including when a sheet failed to load. */
  setArt(art) {
    this.art = art;
    this.sprites.player = art?.playerImage || null;
    this.sprites.tileset = art?.tilesetImage || null;
    const lord = art?.enemies?.lord;
    this.sprites.enemies = {
      bat: art?.enemies?.bat?.image || null,
      shambler: art?.enemies?.shambler?.image || null,
      brute: art?.enemies?.brute?.image || null,
      lord: {
        walk: lord?.walk?.image || null,
        cast: lord?.cast?.image || null,
        dash: lord?.dash?.image || null,
      },
    };
    bindEnemyArt(art?.enemies);
    applyFx(art?.fx);
    if (this.player) this.player.attachArt(art);
  }

  resetWorld() {
    this.player = new Player(0, 0, characterById(this.characterId));
    if (this.art) this.player.attachArt(this.art);
    this.enemies = [];
    this.projectiles = [];
    this.crosses = [];
    this.flasks = [];
    this.pools = [];
    this.gems = [];
    this.particles = [];
    this.floaters = [];
    this.camera = { x: 0, y: 0 };
    this.time = 0;
    this.kills = 0;
    this.pendingLevels = 0;
    this.currentChoices = [];
    this.spawnTimer = 2.2;
    this.shake = 0;
    this.hurtFlash = 0;
    this.eliteState = "idle";
    this.eliteWarning = null;
    this.wardenAppearances = 0;
    this.lordState = "idle";
    this.lordSlain = false;
    this.lordEntrance = 0;
    this.lordLandFlash = 0;
    this.swarmsSeen = new Set();
    this.omen = "";
    this.omenTimer = 0;
  }

  /** QA hook. Stands one second before the lord, and does not replay earlier wardens. */
  debugJumpToLord() {
    this.time = LORD_TIME - 1;
    this.wardenAppearances = 4;
    this.eliteWarning = null;
    if (this.eliteState !== "alive") this.eliteState = "idle";
    this.lordState = "idle";
    this.lordSlain = false;
    this.lordEntrance = 0;
    this.lordLandFlash = 0;
    this.enemies = this.enemies.filter((enemy) => enemy.type !== "lord");
    this.omen = "";
    this.omenTimer = 0;
  }

  togglePerf() {
    this.showPerf = !this.showPerf;
    this.ui.setPerfVisible(this.showPerf);
    if (this.showPerf) this.ui.setPerf(this.fps, this.enemies.length, this.lordEnemy());
  }

  sampleFps(ts) {
    if (this.fpsWindowStart == null) this.fpsWindowStart = ts;
    this.fpsFrames += 1;
    const span = ts - this.fpsWindowStart;
    if (span < 250) return;
    this.fps = (this.fpsFrames * 1000) / span;
    this.fpsFrames = 0;
    this.fpsWindowStart = ts;
  }

  toggleMute() {
    this.audio.toggle();
    this.ui.setMuted(this.audio.muted);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.floor(this.viewW * this.dpr);
    this.canvas.height = Math.floor(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
  }

  /** A run. `characterId` missing or unknown resolves to the hunter. */
  start(characterId) {
    this.characterId = characterById(characterId ?? this.characterId).id;
    this.resetWorld();
    const live = this.player.art?.playerImage;
    if (live) this.sprites.player = live;
    this.state = "playing";
    for (let i = 0; i < 4; i += 1) this.spawnAround("shambler");
    this.ui.setMode("playing");
    this.ui.updateHUD(this);
  }

  /** Character cards. The night does not advance until a choice confirms. */
  openSelect() {
    this.state = "select";
    this.ui.setMode("select");
    this.select?.open();
  }

  frame(ts) {
    if (this.lastTs == null) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (document.hidden) dt = 0;
    this.lastDt = dt;
    this.anim += dt;
    this.sampleFps(ts);
    this.input.setStickContext(this.state === "playing");
    if (this.state === "playing") this.update(dt);
    else if (this.state === "select") this.select?.paint(this.anim);
    this.draw();
    if (this.showPerf) this.ui.setPerf(this.fps, this.enemies.length, this.lordEnemy());
    if (this.state === "playing" || this.state === "levelup") this.ui.updateHUD(this);
    requestAnimationFrame((next) => this.frame(next));
  }

  update(dt) {
    this.time += dt;
    this.maybeSwarm();
    this.maybeElite();
    this.updateElite(dt);
    this.updateLord(dt);
    this.player.update(dt, this.input.axis());
    this.trackAim();
    this.pruneFarEnemies();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval();
      this.spawnBatch();
    }
    for (const enemy of this.enemies) enemy.update(dt, this.player);
    this.separateEnemies();
    this.tryAttack();
    this.updateProjectiles(dt);
    this.updateCenser(dt);
    this.updatePyre(dt);
    this.updateCross(dt);
    this.resolvePulses();
    this.reapEnemies();
    this.updateGems(dt);
    this.resolveContact();
    this.updateFx(dt);
    this.updateCamera(dt);
    this.finishFrame();
  }

  spawnInterval() {
    return spawnIntervalFor(this.time, this.kills);
  }

  maxEnemies() {
    return maxEnemiesFor(this.time, this.kills);
  }

  pickType() {
    const t = this.time;
    if (t < 32) return "shambler";
    const bruteChance = t < 75 ? 0 : Math.min(0.32, (t - 75) / 220);
    const batChance = Math.min(0.48, (t - 32) / 180);
    const roll = Math.random();
    if (roll < bruteChance) return "brute";
    if (roll < bruteChance + batChance) return "bat";
    return "shambler";
  }

  spawnBatch() {
    const cap = this.maxEnemies();
    if (this.enemies.length >= cap) return;
    const count = Math.min(spawnCountFor(this.time, this.kills), cap - this.enemies.length);
    for (let i = 0; i < count; i += 1) this.spawnAround(this.pickType());
  }

  /**
   * Drop the farthest ordinary foe so a spawn can take its slot.
   * Warden and swarm bodies are kept. Their XP is merged into a gem.
   */
  cullOneForCap() {
    let farIndex = -1;
    let farDist = -1;
    const px = this.player.x;
    const py = this.player.y;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (enemy.type === "warden" || enemy.type === "lord" || enemy.swarm) continue;
      const dist = (enemy.x - px) ** 2 + (enemy.y - py) ** 2;
      if (dist > farDist) {
        farDist = dist;
        farIndex = i;
      }
    }
    if (farIndex < 0) return false;
    const [removed] = this.enemies.splice(farIndex, 1);
    this.keepXp(removed);
    return true;
  }

  keepXp(enemy) {
    const xp = enemy.xp || 0;
    if (xp <= 0) return;
    let nearest = null;
    let best = Infinity;
    for (const gem of this.gems) {
      const dist = (gem.x - enemy.x) ** 2 + (gem.y - enemy.y) ** 2;
      if (dist < best) {
        best = dist;
        nearest = gem;
      }
    }
    if (nearest) nearest.addValue(xp);
    else this.gems.push(new Gem(enemy.x, enemy.y, xp));
  }

  maybeSwarm() {
    if (this.time >= CAP_AT_4 && !this.swarmsSeen.has("bats")) {
      this.swarmsSeen.add("bats");
      this.spawnEdgeLine("bat", 30);
    }
    if (this.time >= CAP_AT_6 && !this.swarmsSeen.has("brutes")) {
      this.swarmsSeen.add("brutes");
      this.spawnRing("brute", 12);
    }
    if (this.time >= 8 * 60 && !this.swarmsSeen.has("mixed")) {
      this.swarmsSeen.add("mixed");
      this.spawnMixed(40);
    }
  }

  spawnEdgeLine(typeName, count) {
    const side = Math.floor(Math.random() * 4);
    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    const pad = 72;
    const span = side < 2 ? this.viewW : this.viewH;
    const step = Math.min(28, (span * 0.85) / count);
    for (let i = 0; i < count; i += 1) {
      const along = (i - (count - 1) / 2) * step;
      let x = this.player.x;
      let y = this.player.y;
      if (side === 0) {
        x += along;
        y -= halfH + pad;
      } else if (side === 1) {
        x += along;
        y += halfH + pad;
      } else if (side === 2) {
        x -= halfW + pad;
        y += along;
      } else {
        x += halfW + pad;
        y += along;
      }
      this.pushEnemy(typeName, x, y, true);
    }
  }

  spawnRing(typeName, count) {
    const radius = Math.max(160, Math.min(this.viewW, this.viewH) * 0.36);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      this.pushEnemy(
        typeName,
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        true,
      );
    }
  }

  spawnMixed(count) {
    const types = ["shambler", "bat", "brute"];
    for (let i = 0; i < count; i += 1) {
      const spot = this.offscreenPoint();
      this.pushEnemy(types[i % types.length], spot.x, spot.y, true);
    }
  }

  offscreenPoint() {
    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    const pad = 48 + Math.random() * 80;
    const side = Math.floor(Math.random() * 4);
    let x = this.player.x + (Math.random() - 0.5) * this.viewW;
    let y = this.player.y + (Math.random() - 0.5) * this.viewH;
    if (side === 0) y = this.player.y - halfH - pad;
    else if (side === 1) y = this.player.y + halfH + pad;
    else if (side === 2) x = this.player.x - halfW - pad;
    else x = this.player.x + halfW + pad;
    return { x, y };
  }

  spawnAround(typeName) {
    const spot = this.offscreenPoint();
    this.pushEnemy(typeName, spot.x, spot.y, false);
  }

  pushEnemy(typeName, x, y, swarm) {
    const enemy = new Enemy(typeName, x, y, this.time);
    if (swarm) enemy.swarm = true;
    this.enemies.push(enemy);
    return enemy;
  }

  pruneFarEnemies() {
    const limit = Math.max(1200, Math.hypot(this.viewW, this.viewH) * 0.95);
    const limit2 = limit * limit;
    const px = this.player.x;
    const py = this.player.y;
    this.enemies = this.enemies.filter((enemy) => (
      enemy.type === "warden"
      || enemy.type === "lord"
      || (enemy.x - px) ** 2 + (enemy.y - py) ** 2 <= limit2
    ));
  }

  trackAim() {
    let best = null;
    let bestDist = Infinity;
    const player = this.player;
    for (const enemy of this.enemies) {
      const dist = (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    if (best) player.aim = Math.atan2(best.y - player.y, best.x - player.x);
  }

  tryAttack() {
    const player = this.player;
    if (player.attackTimer > 0 || this.enemies.length === 0) return;
    const targets = nearest(player, this.enemies, player.projectileCount);
    player.attackTimer = player.attackInterval;
    player.aim = Math.atan2(targets[0].y - player.y, targets[0].x - player.x);
    const groups = new Map();
    for (let i = 0; i < player.projectileCount; i += 1) {
      const index = i % targets.length;
      if (!groups.has(index)) groups.set(index, []);
      groups.get(index).push(i);
    }
    for (const [index, shots] of groups) {
      const target = targets[index];
      const base = Math.atan2(target.y - player.y, target.x - player.x);
      const mid = (shots.length - 1) / 2;
      shots.forEach((unused, n) => {
        const angle = base + (n - mid) * 0.22;
        this.projectiles.push(new Projectile(
          player.x + Math.cos(angle) * (player.radius + 6),
          player.y + Math.sin(angle) * (player.radius + 6),
          Math.cos(angle) * player.projectileSpeed,
          Math.sin(angle) * player.projectileSpeed,
          player.damage,
          player.pierce,
          player.projectileLife,
        ));
      });
    }
  }

  updateProjectiles(dt) {
    const kept = [];
    for (const shot of this.projectiles) {
      shot.update(dt);
      if (shot.life <= 0) continue;
      for (const enemy of this.enemies) {
        if (shot.hitsLeft <= 0) break;
        if (shot.hitIds.has(enemy.id) || enemy.hp <= 0) continue;
        const dist = Math.hypot(shot.x - enemy.x, shot.y - enemy.y);
        if (dist > shot.radius + enemy.radius) continue;
        enemy.hp -= shot.damage;
        enemy.hitFlash = 0.09;
        const nx = (enemy.x - shot.x) / (dist || 1);
        const ny = (enemy.y - shot.y) / (dist || 1);
        enemy.x += nx * 7;
        enemy.y += ny * 7;
        shot.hitIds.add(enemy.id);
        shot.hitsLeft -= 1;
        this.audio.play("hit");
        this.floaters.push(new Popup(enemy.x, enemy.y - enemy.radius, String(shot.damage), "#fff1c2"));
      }
      if (shot.hitsLeft > 0 && shot.life > 0) kept.push(shot);
    }
    this.projectiles = kept;
  }

  updateCenser(dt) {
    const player = this.player;
    const censer = player.censer;
    censer.advance(dt);
    if (!censer.owned) return;
    const spokes = censer.spokes(player);
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.censerCd > 0) continue;
      if (!censer.touches(enemy, spokes)) continue;
      enemy.hp -= censer.damage;
      enemy.hitFlash = 0.09;
      enemy.censerCd = censer.hitCooldown;
      this.audio.play("hit");
      this.floaters.push(new Popup(enemy.x, enemy.y - enemy.radius, String(censer.damage), "#d7e8f8"));
    }
  }

  updatePyre(dt) {
    const pyre = this.player.pyre;
    if (pyre.owned && pyre.timer > 0) pyre.timer = Math.max(0, pyre.timer - dt);
    if (pyre.owned && pyre.timer <= 0) {
      const living = this.enemies.filter((enemy) => enemy.hp > 0);
      if (living.length > 0) {
        pyre.timer = pyre.interval;
        const targets = nearest(this.player, living, pyre.charges);
        const spec = {
          radius: pyre.radius,
          damage: pyre.damage,
          duration: pyre.duration,
          tick: pyre.tick,
        };
        for (const enemy of targets) {
          this.flasks.push(new PyreFlask(this.player.x, this.player.y, enemy.x, enemy.y, spec));
        }
      }
    }

    const flying = [];
    for (const flask of this.flasks) {
      flask.update(dt);
      if (flask.done()) {
        const spec = flask.spec;
        this.pools.push(new PyrePool(flask.tx, flask.ty, spec.radius, spec.damage, spec.duration, spec.tick));
      } else {
        flying.push(flask);
      }
    }
    this.flasks = flying;

    const burning = [];
    for (const pool of this.pools) {
      pool.update(dt);
      if (pool.life <= 0) continue;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || !pool.ready(enemy)) continue;
        const reach = pool.radius + enemy.radius * 0.15;
        if (Math.hypot(enemy.x - pool.x, enemy.y - pool.y) > reach) continue;
        enemy.hp -= pool.damage;
        enemy.hitFlash = 0.08;
        pool.mark(enemy);
        this.audio.play("hit");
        this.floaters.push(new Popup(enemy.x, enemy.y - enemy.radius, String(pool.damage), "#ffc48a"));
      }
      burning.push(pool);
    }
    this.pools = burning;
    if (this.pools.length > 24) this.pools.splice(0, this.pools.length - 24);
  }

  updateCross(dt) {
    const cross = this.player.cross;
    if (cross.owned && cross.timer > 0) cross.timer = Math.max(0, cross.timer - dt);
    if (cross.owned && cross.timer <= 0) {
      cross.timer = cross.interval;
      const living = this.enemies.filter((enemy) => enemy.hp > 0);
      let base = this.player.aim;
      if (living.length > 0) {
        const target = nearest(this.player, living, 1)[0];
        base = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      }
      const count = cross.count;
      const mid = (count - 1) / 2;
      for (let i = 0; i < count; i += 1) {
        const angle = base + (i - mid) * 0.5;
        this.crosses.push(new AshBolt(
          this.player.x + Math.cos(angle) * (this.player.radius + 8),
          this.player.y + Math.sin(angle) * (this.player.radius + 8),
          angle,
          cross.damage,
          cross.speed,
          cross.range,
        ));
      }
    }

    const kept = [];
    for (const bolt of this.crosses) {
      if (!bolt.update(dt, this.player)) continue;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || !bolt.ready(enemy)) continue;
        const dist = Math.hypot(bolt.x - enemy.x, bolt.y - enemy.y);
        if (dist > bolt.radius + enemy.radius) continue;
        enemy.hp -= bolt.damage;
        enemy.hitFlash = 0.09;
        bolt.mark(enemy);
        this.audio.play("hit");
        this.floaters.push(new Popup(enemy.x, enemy.y - enemy.radius, String(bolt.damage), "#f0e2cc"));
      }
      kept.push(bolt);
    }
    this.crosses = kept;
    if (this.crosses.length > 16) this.crosses.splice(0, this.crosses.length - 16);
  }

  maybeElite() {
    this.consumeSuppressedWarden();
    this.maybeLord();
    if (this.eliteState === "warning" || this.eliteState === "alive") return;
    if (!eliteDue(this.time, this.kills, this.wardenAppearances)) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.min(this.viewW, this.viewH) * 0.36;
    this.eliteWarning = {
      x: this.player.x + Math.cos(angle) * dist,
      y: this.player.y + Math.sin(angle) * dist,
      time: 0,
      duration: ELITE_WARN,
    };
    this.eliteState = "warning";
    this.omen = "The Warden rises";
    this.omenTimer = 0;
    if (!this.reduceMotion) this.shake = 8;
  }

  updateElite(dt) {
    if (this.eliteState === "warning" && this.eliteWarning) {
      this.eliteWarning.time += dt;
      if (this.eliteWarning.time >= this.eliteWarning.duration) this.spawnWarden();
    }
    if (this.omenTimer > 0) {
      this.omenTimer -= dt;
      if (this.omenTimer <= 0 && this.eliteState !== "warning") this.omen = "";
    }
  }

  /** Appearance 4 is the old 580s warden. Consume that slot and do not spawn it. */
  consumeSuppressedWarden() {
    if (this.eliteState === "warning" || this.eliteState === "alive") return;
    if (this.wardenAppearances <= 0) return;
    const due = ELITE_TIME + this.wardenAppearances * ELITE_INTERVAL;
    if (due === SUPPRESSED_WARDEN_TIME && this.time >= due) this.wardenAppearances += 1;
  }

  maybeLord() {
    if (this.lordState !== "idle" || this.lordSlain) return;
    if (this.time < LORD_TIME) return;
    this.lordState = "approaching";
    this.lordEntrance = 0;
    BossUI.announce("THE VAMPIRE LORD");
  }

  lordEnemy() {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (enemy.type === "lord" && enemy.hp > 0) return enemy;
    }
    return null;
  }

  updateLord(dt) {
    const lord = this.lordEnemy();
    if (lord) BossUI.setHP(lord.hp, lord.maxHp);
    BossUI.update(dt);
    if (this.lordState === "approaching") {
      this.lordEntrance += dt;
      if (this.lordEntrance >= LORD_ENTRANCE) this.spawnLord();
      return;
    }
    if (!lord) return;
    lord.advanceLord(dt, this);
  }

  onBossFx(name) {
    if (this.reduceMotion) return;
    if (name === "lordLand") this.shake = Math.max(this.shake, 36);
    else if (name === "lordDeath") this.shake = Math.max(this.shake, 28);
  }

  spawnLord() {
    if (this.lordState === "alive" || this.lordEnemy()) {
      this.lordState = "alive";
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.min(this.viewW, this.viewH) * 0.42;
    const lord = new Enemy(
      "lord",
      this.player.x + Math.cos(angle) * dist,
      this.player.y + Math.sin(angle) * dist,
      this.time,
    );
    this.enemies.push(lord);
    this.lordState = "alive";
    BossUI.land();
    FX.boss("lordLand");
    this.floaters.push(new Popup(lord.x, lord.y - 70, "VAMPIRE LORD", "#ffb4a8"));
  }

  /**
   * The lord's bats spawn past the cap, the same as a swarm, so the crowd
   * may go over 220. They count toward the cap afterwards.
   */
  spawnLordBats(count) {
    const radius = 150;
    const n = Math.max(0, count | 0);
    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2;
      this.pushEnemy(
        "bat",
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        true,
      );
    }
  }

  spawnWarden() {
    const spot = this.eliteWarning;
    if (!spot || this.eliteState !== "warning") return;
    const generation = this.wardenAppearances;
    this.wardenAppearances += 1;
    this.enemies.push(new Enemy("warden", spot.x, spot.y, this.time, WARDEN_HP_MULT ** generation));
    this.eliteState = "alive";
    this.omen = "The Warden is here";
    this.omenTimer = 2.2;
    if (!this.reduceMotion) this.shake = 18;
    this.floaters.push(new Popup(spot.x, spot.y - 46, "WARDEN", "#ffb4a8"));
  }

  resolvePulses() {
    const player = this.player;
    for (const enemy of this.enemies) {
      const pulses = [];
      if (enemy.pulse) pulses.push(enemy.pulse);
      if (Array.isArray(enemy.pulses)) pulses.push(...enemy.pulses);
      enemy.pulse = null;
      if (enemy.pulses) enemy.pulses.length = 0;
      for (const pulse of pulses) {
        const dist = Math.hypot(player.x - pulse.x, player.y - pulse.y);
        if (dist > pulse.radius + player.radius || player.invuln > 0) continue;
        this.hurt(pulse.damage);
      }
    }
  }

  hurt(amount) {
    const player = this.player;
    player.hp -= amount;
    player.invuln = 0.72;
    if (!this.reduceMotion) this.shake = Math.max(this.shake, 12);
    this.hurtFlash = 0.4;
    this.floaters.push(new Popup(player.x, player.y - 20, `-${amount}`, "#ff9a92"));
    this.audio.play("hurt");
  }

  weaponSummary() {
    const censer = this.player.censer;
    const pyre = this.player.pyre;
    const cross = this.player.cross;
    return {
      stake: {
        damage: this.player.damage,
        count: this.player.projectileCount,
        interval: this.player.attackInterval,
        pierce: this.player.pierce,
      },
      censer: {
        owned: censer.owned,
        orbs: censer.orbs,
        damage: censer.damage,
        radius: censer.radius,
      },
      pyre: {
        owned: pyre.owned,
        charges: pyre.charges,
        damage: pyre.damage,
        radius: pyre.radius,
        interval: pyre.interval,
      },
      cross: {
        owned: cross.owned,
        count: cross.count,
        damage: cross.damage,
        range: cross.range,
        interval: cross.interval,
      },
      magnet: {
        radius: this.player.magnetRadius,
        pickupRadius: this.player.pickupRadius,
        stacks: this.player.magnetStacks,
      },
      elite: this.eliteState,
      threat: nightThreat(this.time, this.kills),
    };
  }

  /** Apply one boon by id. Level-up cards use the same objects. */
  applyUpgrade(id) {
    const upgrade = UPGRADES.find((entry) => entry.id === id);
    if (!upgrade) return false;
    if (upgrade.available && !upgrade.available(this.player)) return false;
    if (upgrade.maxed && upgrade.maxed(this.player)) return false;
    upgrade.apply(this.player);
    return true;
  }

  reapEnemies() {
    const alive = [];
    for (const enemy of this.enemies) {
      if (enemy.hp > 0) {
        alive.push(enemy);
        continue;
      }
      this.kills += 1;
      if (enemy.type === "warden") {
        this.eliteState = "fallen";
        this.omen = "The Warden falls";
        this.omenTimer = 2.4;
        this.dropWardenHoard(enemy);
      } else if (enemy.type === "lord") {
        this.lordState = "slain";
        this.lordSlain = true;
        BossUI.defeated();
        FX.boss("lordDeath");
        this.omen = "The Vampire Lord falls";
        this.omenTimer = 2.4;
      } else {
        this.gems.push(new Gem(enemy.x, enemy.y, enemy.xp));
      }
      const sparks = enemy.type === "warden" || enemy.type === "lord" ? 18 : 7;
      for (let i = 0; i < sparks; i += 1) {
        const color = enemy.type === "warden" && i % 2 === 0 ? "#f2e2a0" : enemy.color;
        this.particles.push(new Spark(enemy.x, enemy.y, color));
      }
    }
    this.enemies = alive;
    this.trimGems();
  }

  trimGems() {
    const cap = 180;
    if (this.gems.length <= cap) return;
    const px = this.player.x;
    const py = this.player.y;
    this.gems.sort((a, b) => {
      const da = (a.x - px) ** 2 + (a.y - py) ** 2;
      const db = (b.x - px) ** 2 + (b.y - py) ** 2;
      return da - db;
    });
    const keeper = this.gems[0];
    for (let i = cap; i < this.gems.length; i += 1) keeper.addValue(this.gems[i].value);
    this.gems.length = cap;
  }

  dropWardenHoard(enemy) {
    this.gems.push(new Gem(enemy.x, enemy.y, 30));
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      this.gems.push(new Gem(
        enemy.x + Math.cos(angle) * 24,
        enemy.y + Math.sin(angle) * 24,
        5,
      ));
    }
  }

  updateGems(dt) {
    const kept = [];
    for (const gem of this.gems) {
      gem.update(dt, this.player);
      if (gem.collectedBy(this.player)) {
        this.audio.play("gem");
        this.pendingLevels += this.player.gainXp(gem.value).length;
      } else {
        kept.push(gem);
      }
    }
    this.gems = kept;
  }

  resolveContact() {
    const player = this.player;
    for (const enemy of this.enemies) {
      let dx = player.x - enemy.x;
      let dy = player.y - enemy.y;
      let dist = Math.hypot(dx, dy);
      const min = player.radius + enemy.radius * 0.82;
      if (dist === 0) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      if (dist >= min) continue;
      const overlap = min - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      player.x += nx * overlap * 0.8;
      player.y += ny * overlap * 0.8;
      if (!enemy.knockbackImmune) {
        enemy.x -= nx * overlap * 0.45;
        enemy.y -= ny * overlap * 0.45;
      }
      if (player.invuln <= 0) this.hurt(enemy.contactDamage ? enemy.contactDamage() : enemy.damage);
    }
  }

  separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const min = (a.radius + b.radius) * 0.85;
        if (dist === 0) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        if (dist >= min) continue;
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        if (a.knockbackImmune && b.knockbackImmune) continue;
        if (a.knockbackImmune) {
          b.x += nx * push * 2;
          b.y += ny * push * 2;
        } else if (b.knockbackImmune) {
          a.x -= nx * push * 2;
          a.y -= ny * push * 2;
        } else {
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  updateFx(dt) {
    this.particles = this.particles.filter((spark) => {
      spark.update(dt);
      return spark.life > 0;
    });
    this.floaters = this.floaters.filter((popup) => {
      popup.update(dt);
      return popup.life > 0;
    });
    if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
    if (this.floaters.length > 48) this.floaters.splice(0, this.floaters.length - 48);
  }

  updateCamera(dt) {
    const k = Math.min(1, dt * 9);
    this.camera.x += (this.player.x - this.camera.x) * k;
    this.camera.y += (this.player.y - this.camera.y) * k;
  }

  finishFrame() {
    if (this.state !== "playing") return;
    if (this.player.hp <= 0) {
      this.enterGameOver();
      return;
    }
    if (this.pendingLevels > 0) {
      this.openLevelUp();
      return;
    }
    if (this.lordSlain) {
      this.enterVictory("lord");
      return;
    }
    if (this.time >= DAWN_TIME) this.enterVictory("dawn");
  }

  /** Back to the night. A slain lord, then dawn, after any open level-up cards. */
  resumePlay() {
    this.state = "playing";
    this.ui.setMode("playing");
    if (this.player.hp <= 0) return;
    if (this.lordSlain) this.enterVictory("lord");
    else if (this.time >= DAWN_TIME) this.enterVictory("dawn");
  }

  enterVictory(kind) {
    if (this.state === "victory") return;
    this.state = "victory";
    this.pendingLevels = 0;
    this.currentChoices = [];
    const lord = kind === "lord";
    this.ui.showDawn({
      time: this.time,
      kills: this.kills,
      level: this.player.level,
      title: lord ? "Lord slain" : "Dawn breaks — the Lord escapes",
      gold: lord,
    });
  }

  openLevelUp() {
    this.currentChoices = rollUpgrades(this.player, 3);
    if (this.currentChoices.length === 0) {
      this.pendingLevels = 0;
      this.resumePlay();
      return;
    }
    this.state = "levelup";
    this.audio.play("level");
    this.ui.showLevelUp(this.player, this.currentChoices, (index) => this.chooseUpgrade(index));
  }

  chooseUpgrade(index) {
    if (this.state !== "levelup") return;
    const upgrade = this.currentChoices[index];
    if (!upgrade) return;
    upgrade.apply(this.player);
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.currentChoices = [];
    if (this.pendingLevels > 0) {
      this.openLevelUp();
      return;
    }
    this.resumePlay();
  }

  enterGameOver() {
    if (this.state === "gameover") return;
    this.state = "gameover";
    this.player.hp = 0;
    this.pendingLevels = 0;
    this.currentChoices = [];
    this.audio.play("death");
    const censer = this.player.censer;
    const pyre = this.player.pyre;
    const cross = this.player.cross;
    const weapons = ["Stake"];
    if (censer.owned) weapons.push(`Censer ×${censer.orbs}`);
    if (pyre.owned) weapons.push(`Pyre ×${pyre.charges}`);
    if (cross.owned) weapons.push(`Cross ×${cross.count}`);
    this.ui.showGameOver({
      time: this.time,
      level: this.player.level,
      kills: this.kills,
      weapons: weapons.join(" · "),
    });
  }

  draw() {
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0) {
      shakeX = (Math.random() - 0.5) * this.shake;
      shakeY = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - 34 * this.lastDt);
    }

    this.drawBackground(ctx, w, h, shakeX, shakeY);
    ctx.save();
    ctx.translate(w / 2 - this.camera.x + shakeX, h / 2 - this.camera.y + shakeY);
    for (const pool of this.pools) pool.draw(ctx, this.anim);
    this.drawEliteWarning(ctx);
    this.drawWardenMarks(ctx);
    this.drawLordDash(ctx);
    this.drawMagnetReach(ctx);
    for (const gem of this.gems) gem.draw(ctx);
    for (const spark of this.particles) spark.draw(ctx);
    const actors = this.enemies.slice();
    actors.push(this.player);
    actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) actor.draw(ctx, this.anim);
    this.player.censer.draw(ctx, this.player, this.anim);
    for (const flask of this.flasks) flask.draw(ctx);
    for (const shot of this.projectiles) shot.draw(ctx);
    for (const bolt of this.crosses) bolt.draw(ctx);
    for (const popup of this.floaters) popup.draw(ctx);
    ctx.restore();
    this.drawVignette(ctx, w, h);
    BossUI.draw(ctx, w, h);
  }

  drawMagnetReach(ctx) {
    const player = this.player;
    if (player.magnetStacks <= 0) return;
    ctx.save();
    ctx.strokeStyle = "rgba(125, 206, 176, 0.38)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.magnetRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawBackground(ctx, w, h, shakeX, shakeY) {
    const ground = this.art?.ground;
    if (ground) {
      ctx.fillStyle = "#071018";
      ctx.fillRect(0, 0, w, h);
      ground.draw(ctx, this.camera, w, h, shakeX, shakeY);
      ctx.fillStyle = "rgba(6, 8, 16, 0.34)";
      ctx.fillRect(0, 0, w, h);
      if (this.state === "menu") {
        ctx.fillStyle = "rgba(4, 6, 12, 0.5)";
        ctx.fillRect(0, 0, w, h);
      }
      return;
    }
    ctx.fillStyle = "#10141c";
    ctx.fillRect(0, 0, w, h);
    const spacing = 64;
    const left = this.camera.x - w / 2 - shakeX;
    const top = this.camera.y - h / 2 - shakeY;
    const startX = Math.floor(left / spacing) * spacing;
    const startY = Math.floor(top / spacing) * spacing;
    const endX = this.camera.x + w / 2 - shakeX + spacing;
    const endY = this.camera.y + h / 2 - shakeY + spacing;
    for (let x = startX; x < endX; x += spacing) {
      for (let y = startY; y < endY; y += spacing) {
        const sx = Math.round(x - this.camera.x + w / 2 + shakeX);
        const sy = Math.round(y - this.camera.y + h / 2 + shakeY);
        const n = hash01(Math.round(x / spacing), Math.round(y / spacing));
        ctx.fillStyle = "rgba(190, 198, 176, 0.045)";
        ctx.fillRect(sx, sy, 2, 2);
        if (n > 0.84) {
          ctx.fillStyle = n > 0.94 ? "#2a3830" : "#1a2622";
          ctx.beginPath();
          ctx.ellipse(sx + 18, sy + 14, 8 + n * 8, 3.5 + n * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawEliteWarning(ctx) {
    if (this.eliteState !== "warning" || !this.eliteWarning) return;
    const warn = this.eliteWarning;
    const t = Math.max(0, Math.min(1, warn.time / warn.duration));
    const pulse = 0.5 + 0.5 * Math.sin(warn.time * 14);
    ctx.save();
    ctx.translate(warn.x, warn.y);
    ctx.fillStyle = `rgba(120, 12, 24, ${0.18 + t * 0.28})`;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + t * 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 72, 56, ${0.35 + pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + t * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 210, 180, ${0.3 + t * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 16);
    ctx.stroke();
    ctx.restore();
  }

  drawMarkCircle(ctx, mark, winding, t) {
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.fillStyle = winding
      ? `rgba(160, 16, 28, ${0.08 + 0.22 * t})`
      : "rgba(255, 180, 120, 0.28)";
    ctx.beginPath();
    ctx.arc(0, 0, mark.radius * (winding ? Math.max(0.2, t) : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = winding
      ? `rgba(255, 70, 54, ${0.4 + 0.55 * t})`
      : "rgba(255, 226, 190, 0.9)";
    ctx.lineWidth = winding ? 2 + t * 3 : 4;
    ctx.beginPath();
    ctx.arc(0, 0, mark.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawWardenMarks(ctx) {
    for (const enemy of this.enemies) {
      if (enemy.type === "warden" && enemy.mark) {
        const winding = enemy.phase === "windup" && enemy.windupMax > 0;
        const t = winding ? 1 - enemy.windup / enemy.windupMax : 1;
        this.drawMarkCircle(ctx, enemy.mark, winding, t);
      }
      if (enemy.type === "lord" && enemy.marks) {
        for (const mark of enemy.marks) {
          const winding = mark.burst <= 0 && mark.windupMax > 0;
          const t = winding ? 1 - mark.windup / mark.windupMax : 1;
          this.drawMarkCircle(ctx, mark, winding, Math.max(0, Math.min(1, t)));
        }
      }
    }
  }

  drawLordDash(ctx) {
    for (const enemy of this.enemies) {
      if (enemy.type !== "lord" || enemy.dash?.phase !== "line") continue;
      const dash = enemy.dash;
      const t01 = dash.duration > 0 ? Math.max(0, Math.min(1, dash.time / dash.duration)) : 0;
      BossUI.drawDashLine(
        ctx,
        enemy.x,
        enemy.y,
        enemy.x + dash.dx * dash.distance,
        enemy.y + dash.dy * dash.distance,
        t01,
      );
    }
  }

  drawVignette(ctx, w, h) {
    const reach = Math.max(w, h) * 0.68;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, reach);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    if (this.eliteState === "warning" && this.eliteWarning) {
      const pulse = 0.5 + 0.5 * Math.sin(this.eliteWarning.time * 10);
      ctx.fillStyle = `rgba(120, 16, 24, ${0.06 + pulse * 0.1})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(130, 18, 28, ${this.hurtFlash})`;
      ctx.fillRect(0, 0, w, h);
      this.hurtFlash = Math.max(0, this.hurtFlash - 1.15 * this.lastDt);
    }
  }
}

function nearest(origin, enemies, count) {
  return enemies
    .map((enemy) => ({
      enemy,
      dist: (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2,
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((entry) => entry.enemy);
}
