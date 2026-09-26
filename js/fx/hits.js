// fx/hits.js — Nightfall hit effects, damage numbers, screen shake, hit sounds.
// Self-contained, no dependencies. Draw particles/numbers AFTER the camera transform (world coords).
//
// Usage:
//   import { FX } from './fx/hits.js';
//   FX.hit('scythe', enemy.x, enemy.y, { dmg: 22, crit: false, enemyId: enemy.id, kill: false });
//   enemy.flashT = FX.FLASH_S;             // white hit flash (70ms), draw with your existing tint
//   FX.update(dt);                          // once per frame (seconds)
//   const s = FX.shakeOffset(); ctx.translate(s.x, s.y);  // before the world draw
//   FX.drawWorld(ctx);                      // after enemies, before HUD
//   FX.boss('lordLand');                    // big one-off moments

const MAX_PARTICLES = 300;
const MAX_NUMBERS = 40;
const MERGE_WINDOW = 0.5;   // seconds: ticks on the same enemy merge into one number
const MAX_VOICES = 6;

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- particle pool ----------
const P = [];
for (let i = 0; i < MAX_PARTICLES; i++) P.push({ live: false });
let pCursor = 0, liveCount = 0;
function spawn(o) {
  // round-robin: when full, the oldest particle is overwritten (never allocates)
  const p = P[pCursor]; pCursor = (pCursor + 1) % MAX_PARTICLES;
  if (!p.live) liveCount++;
  p.live = true; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
  p.life = p.max = o.life || 0.3; p.size = o.size || 2; p.color = o.color || '#fff';
  p.kind = o.kind || 'dot'; p.g = o.g || 0; p.drag = o.drag ?? 4; p.ang = o.ang || 0; p.len = o.len || 0;
  p.r0 = o.r0 || 0; p.r1 = o.r1 || 0;
}
function burst(x, y, n, color, speed, life, size, extra = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.5, speed);
    spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: rand(life * 0.7, life), size, ...extra });
  }
}
const ring = (x, y, color, r0, r1, life) => spawn({ x, y, kind: 'ring', color, r0, r1, life, drag: 0 });
const slash = (x, y, color, len, life, ang = rand(0, Math.PI)) => spawn({ x, y, kind: 'line', color, len, ang, life, drag: 0 });

// ---------- per-weapon hit effects (keys match weapon ids; aliases for reskins) ----------
const HITS = {
  stake:    (x, y) => burst(x, y, 4, '#8a5a32', 140, 0.25, 2, { g: 300 }),
  crossbow: (x, y) => { burst(x, y, 6, '#ffd9a0', 180, 0.18, 2); ring(x, y, '#ffe6b0', 2, 14, 0.15); },
  dagger:   (x, y) => { slash(x, y, '#e8f0ff', 16, 0.12); burst(x, y, 1, '#fff', 20, 0.12, 2); },
  whip:     (x, y) => { slash(x, y, '#c9b8ff', 22, 0.14, 0); burst(x, y, 3, '#b8a0ff', 90, 0.2, 2); },
  scythe:   (x, y) => { slash(x, y, '#ff4a5a', 24, 0.2); slash(x, y, '#ff8a94', 14, 0.2); },
  cross:    (x, y) => { ring(x, y, '#ffd24a', 3, 18, 0.2); burst(x, y, 3, '#fff2b0', 80, 0.2, 2); },
  pyre:     (x, y) => { ring(x, y, '#7fc8ff', 4, 16, 0.25); burst(x, y, 3, '#bfe6ff', 40, 0.5, 2, { vy: -30, g: -60 }); }, // holy water
  torch:    (x, y) => burst(x, y, 4, Math.random() < 0.5 ? '#ff9a2e' : '#ffd05a', 70, 0.35, 2, { g: -120 }),
  censer:   (x, y) => ring(x, y, 'rgba(255,240,190,0.8)', 6, 20, 0.22), // lantern
  tome:     (x, y) => { burst(x, y, 5, '#9a5cff', 100, 0.3, 2, { g: 80 }); ring(x, y, '#c9a0ff', 2, 10, 0.15); },
  lord:     (x, y) => burst(x, y, 10, '#ff3040', 220, 0.4, 3),
};
HITS.holywater = HITS.pyre; HITS.lantern = HITS.censer; HITS.boomerang = HITS.cross;
const warned = new Set();
const BIG = new Set(['scythe', 'crossbow']);      // only these shake on hit (and kills on the Lord)

// ---------- damage numbers (merged per enemy, capped) ----------
const nums = [];            // {x,y,val,crit,t,max,enemyId,open}
function addNumber(x, y, val, crit, enemyId) {
  if (enemyId != null) {
    const open = nums.find(n => n.enemyId === enemyId && n.open > 0);
    if (open) { open.val += val; open.crit ||= crit; open.x = x; open.y = y - 10; open.t = open.max; return; }
  }
  if (nums.length >= MAX_NUMBERS) {
    // drop the smallest on screen rather than the newest, so big hits always show
    let k = 0; for (let i = 1; i < nums.length; i++) if (nums[i].val < nums[k].val) k = i;
    if (nums[k].val > val && !crit) return;
    nums.splice(k, 1);
  }
  nums.push({ x: x + rand(-6, 6), y: y - 10, val, crit, t: 0.6, max: 0.6, enemyId, open: MERGE_WINDOW });
}

// ---------- screen shake ----------
let shakeT = 0, shakeMax = 0, shakeAmp = 0;
function shake(amp, dur) { if (amp >= shakeAmp * (shakeT / (shakeMax || 1))) { shakeAmp = amp; shakeT = shakeMax = dur; } }

// ---------- hit sounds (Web Audio synth, no files) ----------
let ac = null, voices = 0;
const TONES = { stake: 220, crossbow: 150, dagger: 900, whip: 520, scythe: 180, cross: 700,
  pyre: 400, torch: 300, censer: 600, tome: 460, lord: 90, holywater: 400, lantern: 600, boomerang: 700 };
function blip(weapon, loud = 1) {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ac.state === 'suspended' || voices >= MAX_VOICES) return;   // resume ac on first user input elsewhere
  const f = (TONES[weapon] || 300) * rand(0.92, 1.08);            // ±8% pitch
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = weapon === 'dagger' || weapon === 'cross' ? 'triangle' : 'square';
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.08);
  g.gain.setValueAtTime(0.06 * loud, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.1);
  voices++; o.onended = () => voices--;
}

// ---------- public API ----------
export const FX = {
  FLASH_S: 0.07,
  reset() { for (const p of P) p.live = false; liveCount = 0; nums.length = 0; shakeT = shakeAmp = 0; },  // call from begin()
  unlockAudio() { if (!ac) blip('dagger', 0); ac?.resume?.(); },  // call from first keydown/click

  hit(weapon, x, y, { dmg = 0, crit = false, enemyId = null, kill = false, boss = false } = {}) {
    const fx = HITS[weapon];
    if (!fx && !warned.has(weapon)) { warned.add(weapon); console.warn(`[FX] unknown weapon id "${weapon}", using stake effect`); }
    (fx || HITS.stake)(x, y);
    if (dmg > 0) addNumber(x, y, Math.round(dmg), crit, enemyId);
    if (BIG.has(weapon) || (boss && kill)) shake(BIG.has(weapon) ? 2 : 6, 0.12);
    blip(weapon, crit ? 1.4 : 1);
    if (kill) burst(x, y, 6, '#ffffff', 120, 0.2, 2);
  },

  boss(moment) {
    if (moment === 'lordLand') { shake(10, 0.45); blip('lord', 2); }
    if (moment === 'lordDash') shake(4, 0.2);
    if (moment === 'lordDeath') shake(12, 0.8);
  },
  levelUp() { /* intentionally no shake: the card screen pauses instead */ blip('cross', 1.2); },

  update(dt) {
    for (const p of P) {
      if (!p.live) continue;
      p.life -= dt; if (p.life <= 0) { p.live = false; liveCount--; continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i]; n.t -= dt; n.open -= dt; n.y -= 28 * dt;
      if (n.t <= 0) nums.splice(i, 1);
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  },

  shakeOffset() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    const k = shakeAmp * (shakeT / shakeMax);           // linear falloff
    return { x: Math.round(rand(-k, k)), y: Math.round(rand(-k, k)) };  // whole pixels keep pixel art crisp
  },

  drawWorld(ctx) {
    ctx.save();
    for (const p of P) {
      if (!p.live) continue;
      const a = p.life / p.max; ctx.globalAlpha = a;
      if (p.kind === 'dot') { ctx.fillStyle = p.color; ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size); }
      else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(p.x, p.y, p.r1 + (p.r0 - p.r1) * a, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'line') {
        const h = p.len * (0.6 + 0.4 * (1 - a)), c = Math.cos(p.ang) * h, s = Math.sin(p.ang) * h;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(p.x - c, p.y - s); ctx.lineTo(p.x + c, p.y + s); ctx.stroke();
      }
    }
    ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    for (const n of nums) {
      const age = 1 - n.t / n.max;
      const pop = age < 0.15 ? 1 + (1 - age / 0.15) * 0.4 : 1;  // pops in at 1.4x, eases to 1x
      ctx.globalAlpha = Math.min(1, n.t / 0.2);
      ctx.font = `bold ${Math.round((n.crit ? 16 : 11) * pop)}px monospace`;
      ctx.fillStyle = n.crit ? '#ffe04a' : '#ffffff';
      ctx.strokeText(n.val, n.x, n.y); ctx.fillText(n.val, n.x, n.y);
    }
    ctx.restore();
  },

  stats() { return { particles: liveCount, numbers: nums.length, voices }; }, // for the F3 overlay
};
