/** Character cards. The night stays paused until confirm. */

import { CHARACTER_ORDER, CHARACTERS, readCharacterId } from "./characters.js";

const WALK_FPS = 10;
const PORTRAIT = 160;

const STATS = [
  { key: "hp", label: "HP" },
  { key: "speed", label: "Speed" },
  { key: "damage", label: "Damage" },
  { key: "rate", label: "Rate" },
];

function statCaps() {
  const list = CHARACTER_ORDER.map((id) => CHARACTERS[id]);
  return {
    hp: Math.max(...list.map((c) => c.maxHp)),
    speed: Math.max(...list.map((c) => c.speed)),
    damage: Math.max(...list.map((c) => c.damage)),
    rate: Math.max(...list.map((c) => 1 / c.attackInterval)),
  };
}

function statRatio(character, key, caps) {
  if (key === "hp") return character.maxHp / caps.hp;
  if (key === "speed") return character.speed / caps.speed;
  if (key === "damage") return character.damage / caps.damage;
  return (1 / character.attackInterval) / caps.rate;
}

export function createSelect(game, begin) {
  const cardsRoot = document.getElementById("char-cards");
  const flash = document.getElementById("night-flash");
  const caps = statCaps();
  const portraits = new Map();
  let index = 0;
  let busy = false;

  CHARACTER_ORDER.forEach((id, cardIndex) => {
    const character = CHARACTERS[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "char-card";
    card.dataset.character = id;
    card.setAttribute("aria-pressed", "false");

    const canvas = document.createElement("canvas");
    canvas.className = "char-portrait";
    canvas.width = PORTRAIT;
    canvas.height = PORTRAIT;
    canvas.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "char-name";
    name.textContent = character.name;

    const blurb = document.createElement("span");
    blurb.className = "char-blurb";
    blurb.textContent = character.blurb;

    const tag = document.createElement("span");
    tag.className = "char-tag";
    if (character.pierce > 0) tag.textContent = `Pierce ${character.pierce}`;

    const stats = document.createElement("span");
    stats.className = "char-stats";
    for (const stat of STATS) {
      const row = document.createElement("span");
      row.className = "stat";
      const label = document.createElement("span");
      label.className = "stat-label";
      label.textContent = stat.label;
      const track = document.createElement("span");
      track.className = "stat-track";
      const fill = document.createElement("span");
      fill.className = "stat-fill";
      // Width is this hunter's stat divided by the higher of the two. The bar itself stays unlabeled.
      fill.style.width = `${Math.round(statRatio(character, stat.key, caps) * 100)}%`;
      track.append(fill);
      row.append(label, track);
      stats.append(row);
    }

    card.append(canvas, name, blurb, tag, stats);
    card.addEventListener("click", () => {
      if (index === cardIndex) confirm();
      else choose(cardIndex, true);
    });
    cardsRoot.append(card);
    portraits.set(id, canvas);
  });

  function choose(next, tick) {
    const count = CHARACTER_ORDER.length;
    index = ((next % count) + count) % count;
    const cards = cardsRoot.querySelectorAll(".char-card");
    cards.forEach((card, cardIndex) => {
      const on = cardIndex === index;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (tick) game.audio.play("tick");
  }

  function confirm() {
    if (busy || game.state !== "select") return;
    busy = true;
    const id = CHARACTER_ORDER[index];
    if (flash) {
      flash.classList.remove("flash");
      void flash.offsetWidth;
      flash.classList.add("flash");
    }
    begin(id);
    window.setTimeout(() => {
      busy = false;
    }, 480);
  }

  function paint(time) {
    const library = game.art?.characters;
    if (!library) return;
    for (const id of CHARACTER_ORDER) {
      const canvas = portraits.get(id);
      const sheet = library[id];
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!sheet?.image) continue;
      canvas.dataset.sheet = sheet.image.currentSrc || sheet.image.src;
      const frameW = sheet.frameWidth;
      const frameH = sheet.frameHeight;
      const row = Math.max(0, (sheet.rows || []).indexOf("south"));
      const frames = sheet.walkFrames >= 1 ? sheet.walkFrames : 1;
      const col = 1 + (Math.floor(time * WALK_FPS) % frames);
      const scale = Math.min(canvas.width / frameW, canvas.height / frameH);
      const drawW = frameW * scale;
      const drawH = frameH * scale;
      ctx.drawImage(
        sheet.image,
        col * frameW,
        row * frameH,
        frameW,
        frameH,
        (canvas.width - drawW) / 2,
        (canvas.height - drawH) / 2,
        drawW,
        drawH,
      );
    }
  }

  return {
    open() {
      busy = false;
      const saved = CHARACTER_ORDER.indexOf(readCharacterId());
      choose(saved >= 0 ? saved : 0, false);
    },
    move(step) {
      if (game.state !== "select") return;
      choose(index + step, true);
    },
    confirm,
    paint,
  };
}
