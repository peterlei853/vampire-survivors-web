// ui/boss.js — Vampire Lord entrance, telegraphs and boss HP bar. Screen-space (draw after HUD reset).
//
//   import { BossUI } from './ui/boss.js';  import { FX } from '../fxart.js';
//   BossUI.announce('THE VAMPIRE LORD');     // at 9:00, ~1.6s before he lands; keep the game running
//   BossUI.land(); FX.boss('lordLand');      // when he touches down
//   BossUI.setHP(hp, maxHp);                 // every frame while alive (drives the bar + lag bar)
//   BossUI.update(dt); BossUI.draw(ctx, W, H);
//   BossUI.drawDashLine(ctx, x0, y0, x1, y1, t01)  // world space, during the 1s dash telegraph
//   BossUI.defeated(); FX.boss('lordDeath');
//   BossUI.reset();                          // every run start and restart

const easeOutCubic = x => 1 - (1 - x) ** 3;
let annT = 0, annText = '', landT = 0, hp = 0, maxHp = 1, lagHp = 0, shown = 0, active = false, hitT = 0, deadT = 0;
const ANN = 1.6;

export const BossUI = {
  announce(text) { annText = text; annT = ANN; },
  land() { landT = 0.35; active = true; shown = 0; deadT = 0; },
  setHP(h, m) { if (h < hp) hitT = 0.08; hp = Math.max(0, h); maxHp = Math.max(1, m); if (lagHp < hp) lagHp = hp; },
  defeated() { deadT = 1.2; },
  reset() { annT = landT = hitT = deadT = 0; hp = lagHp = shown = 0; maxHp = 1; active = false; },
  get active() { return active; },

  update(dt) {
    annT = Math.max(0, annT - dt); landT = Math.max(0, landT - dt); hitT = Math.max(0, hitT - dt);
    if (active) shown = Math.min(1, shown + dt / 0.6);           // bar fills in over 0.6s on entrance
    lagHp += (hp - lagHp) * Math.min(1, dt * 3);                 // white "damage taken" bar drains behind red
    if (deadT > 0) { deadT -= dt; if (deadT <= 0) active = false; }
  },

  draw(ctx, W, H) {
    ctx.save();
    // 1. screen darken + vignette during the warning
    if (annT > 0) {
      const k = Math.sin(Math.PI * (1 - annT / ANN));            // fades in and out
      ctx.fillStyle = `rgba(20,0,6,${0.45 * k})`; ctx.fillRect(0, 0, W, H);
      // warning banner slides in from the left
      const bx = (easeOutCubic(Math.min(1, (ANN - annT) / 0.3)) - 1) * W;
      ctx.globalAlpha = Math.min(1, annT / 0.25);
      ctx.fillStyle = 'rgba(90,0,14,0.85)'; ctx.fillRect(bx, H * 0.38, W, 56);
      ctx.fillStyle = '#ff3a4a'; ctx.fillRect(bx, H * 0.38, W, 2); ctx.fillRect(bx, H * 0.38 + 54, W, 2);
      ctx.fillStyle = '#ffe8ea'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
      ctx.fillText(annText, bx + W / 2, H * 0.38 + 37);
      ctx.globalAlpha = 1;
    }
    // 2. landing flash
    if (landT > 0) { ctx.fillStyle = `rgba(255,220,225,${0.5 * landT / 0.35})`; ctx.fillRect(0, 0, W, H); }
    // 3. boss HP bar across the top
    if (active) {
      const bw = Math.min(560, W - 80), bx = (W - bw) / 2, by = 18, bh = 12;
      const fill = shown * (hp / maxHp), lag = shown * (lagHp / maxHp);
      ctx.globalAlpha = deadT > 0 ? Math.max(0, deadT / 1.2) : 1;
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#2a0a10'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#f4e6e8'; ctx.fillRect(bx, by, bw * lag, bh);
      ctx.fillStyle = hitT > 0 ? '#ffffff' : (hp / maxHp < 0.5 ? '#ff2438' : '#c4142a'); ctx.fillRect(bx, by, bw * fill, bh);
      ctx.fillStyle = '#000'; ctx.fillRect((bx + bw / 2) | 0, by, 1, bh);   // 50% phase tick
      ctx.fillStyle = '#ffd8dc'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('VAMPIRE LORD', W / 2, by + bh + 14);
    }
    ctx.restore();
  },

  // Blood dash telegraph: thin line that thickens and flashes faster as t01 goes 0 to 1.
  drawDashLine(ctx, x0, y0, x1, y1, t01) {
    ctx.save();
    const blink = 0.5 + 0.5 * Math.sin(t01 * t01 * 40);
    ctx.strokeStyle = `rgba(255,40,60,${0.35 + 0.5 * blink})`;
    ctx.lineWidth = 2 + 8 * t01; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  },
};
