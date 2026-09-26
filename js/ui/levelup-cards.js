// ui/levelup-cards.js — weapon icons on the level-up card screen.
// Icons come from export/web-weapons/<weapon>/icon.png (Asset Manager). Missing icons fall back to a drawn glyph.
//
//   import { CardIcons } from './ui/levelup-cards.js';
//   CardIcons.preload(['stake','crossbow','dagger','whip','scythe','cross','pyre','torch','censer','tome']);
//   CardIcons.drawCard(ctx, card, x, y, w, h, selected, t);  // card = {id, weapon, title, desc, isNew, level, maxLevel, kind}

const imgs = {};
const FALLBACK = { stake: '#8a5a32', crossbow: '#c08040', dagger: '#dfe8ff', whip: '#b8a0ff', scythe: '#ff4a5a',
  cross: '#ffd24a', pyre: '#7fc8ff', torch: '#ff9a2e', censer: '#fff0b0', tome: '#9a5cff',
  bloodDraught: '#c0182a', darkPact: '#5a2a7a' };
const easeOutBack = x => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

export const CardIcons = {
  preload(ids, base = 'assets/weapons') {
    for (const id of ids) { const im = new Image(); im.src = `${base}/${id}/icon.png`; imgs[id] = im; }
  },

  whenReady() {
    return Promise.all(Object.values(imgs).map((im) => {
      if (im.complete) return Promise.resolve();
      return new Promise((resolve) => {
        im.addEventListener('load', () => resolve(), { once: true });
        im.addEventListener('error', () => resolve(), { once: true });
      });
    }));
  },

  /** Loaded icons. `ok` means drawIcon will use the bitmap, not the placeholder circle. */
  status() {
    return Object.entries(imgs).map(([id, im]) => ({
      id,
      ok: Boolean(im.complete && im.naturalWidth > 0),
      width: im.naturalWidth || 0,
      height: im.naturalHeight || 0,
    }));
  },

  drawIcon(ctx, id, cx, cy, size) {
    const im = imgs[id];
    ctx.imageSmoothingEnabled = false;                      // keep pixel art crisp
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, (cx - size / 2) | 0, (cy - size / 2) | 0, size, size);
    else { ctx.fillStyle = FALLBACK[id] || '#888'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2); ctx.fill(); }
  },

  // Card needs about 240px height for the 2x icon layout.
  // t = seconds since the card screen opened; cards slide in staggered by index via card.index
  drawCard(ctx, card, x, y, w, h, selected, t) {
    const k = Math.min(1, Math.max(0, (t - (card.index || 0) * 0.06) / 0.25));
    const s = easeOutBack(k) * (selected ? 1.06 : 1);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2 + (1 - k) * 30); ctx.scale(s, s); ctx.globalAlpha = k;
    // panel
    ctx.fillStyle = '#15121c'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = selected ? '#e8dcff' : '#4a4058'; ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // icon slot: 64x64 source drawn at 2x, with a soft pulse behind it when selected
    const iy = -h / 2 + 84;                                   // 128px icon (64px source at 2x)
    if (selected) { ctx.fillStyle = `rgba(200,170,255,${0.15 + 0.1 * Math.sin(t * 6)})`; ctx.beginPath(); ctx.arc(0, iy, 76, 0, Math.PI * 2); ctx.fill(); }
    this.drawIcon(ctx, card.weapon || card.id, 0, iy, 128);
    // NEW badge for unlocks, level pips for upgrades
    ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace';
    if (card.isNew) { ctx.fillStyle = '#ffd24a'; ctx.fillText('NEW', w / 2 - 22, -h / 2 + 16); }
    else if (card.maxLevel) {
      const n = card.maxLevel, gap = 10, x0 = -((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < card.level ? '#e8dcff' : (i === card.level ? `rgba(232,220,255,${0.4 + 0.4 * Math.sin(t * 8)})` : '#3a3346');
        ctx.fillRect((x0 + i * gap - 3) | 0, iy + 72, 6, 6);  // next level blinks
      }
    }
    // text
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.fillText(card.title, 0, iy + 98);
    ctx.fillStyle = '#b8b0c8'; ctx.font = '11px monospace';
    (card.desc || '').split('\n').forEach((line, i) => ctx.fillText(line, 0, iy + 118 + i * 14));
    ctx.restore();
  },
};
