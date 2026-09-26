/** DOM HUD, level-up cards, and the game-over sheet. */

import { CardIcons } from "./ui/levelup-cards.js";

const CARD_W = 220;
const CARD_H = 268;

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export class UI {
  constructor() {
    this.hud = document.getElementById("hud");
    this.hpFill = document.getElementById("hp-fill");
    this.hpText = document.getElementById("hp-text");
    this.hpBar = document.getElementById("hp-bar");
    this.xpFill = document.getElementById("xp-fill");
    this.xpText = document.getElementById("xp-text");
    this.levelText = document.getElementById("level");
    this.killsText = document.getElementById("kills");
    this.timerText = document.getElementById("timer");
    this.weaponStake = document.getElementById("weapon-stake");
    this.weaponCenser = document.getElementById("weapon-censer");
    this.weaponPyre = document.getElementById("weapon-pyre");
    this.weaponCross = document.getElementById("weapon-cross");
    this.weaponDagger = document.getElementById("weapon-dagger");
    this.weaponWhip = document.getElementById("weapon-whip");
    this.weaponScythe = document.getElementById("weapon-scythe");
    this.weaponTorch = document.getElementById("weapon-torch");
    this.weaponTome = document.getElementById("weapon-tome");
    this.magnetReadout = document.getElementById("magnet");
    this.omen = document.getElementById("omen");
    this.muteButton = document.getElementById("btn-mute");
    this.startOverlay = document.getElementById("overlay-start");
    this.selectOverlay = document.getElementById("overlay-select");
    this.levelOverlay = document.getElementById("overlay-level");
    this.overOverlay = document.getElementById("overlay-over");
    this.winOverlay = document.getElementById("overlay-win");
    this.winSummary = document.getElementById("win-summary");
    this.perf = document.getElementById("perf");
    this.choices = document.getElementById("choices");
    this.summary = document.getElementById("summary");
    this.levelViews = null;
    this.levelT0 = 0;
    this.levelSelected = 0;
  }

  setMode(mode) {
    const sheet = mode === "menu" || mode === "select" || mode === "gameover" || mode === "victory";
    this.hud.classList.toggle("hidden", sheet);
    this.startOverlay.classList.toggle("hidden", mode !== "menu");
    if (this.selectOverlay) this.selectOverlay.classList.toggle("hidden", mode !== "select");
    this.levelOverlay.classList.toggle("hidden", mode !== "levelup");
    this.overOverlay.classList.toggle("hidden", mode !== "gameover");
    if (this.winOverlay) this.winOverlay.classList.toggle("hidden", mode !== "victory");
  }

  setPerfVisible(on) {
    if (!this.perf) return;
    this.perf.classList.toggle("hidden", !on);
    this.perf.setAttribute("aria-hidden", on ? "false" : "true");
  }

  setPerf(fps, enemies, fxStats) {
    if (!this.perf) return;
    const shown = Number.isFinite(fps) ? Math.round(fps) : 0;
    const particles = fxStats ? fxStats.particles : 0;
    const numbers = fxStats ? fxStats.numbers : 0;
    this.perf.textContent = `FPS ${shown} · Enemies ${enemies} · Particles ${particles} · Numbers ${numbers}`;
  }

  updateHUD(game) {
    const player = game.player;
    const hpRatio = player.maxHp > 0 ? Math.max(0, player.hp) / player.maxHp : 0;
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.round(player.hp))} / ${player.maxHp}`;
    this.hpBar.classList.toggle("low", hpRatio > 0 && hpRatio <= 0.3);
    const xpRatio = player.xpToNext > 0 ? player.xp / player.xpToNext : 0;
    this.xpFill.style.width = `${Math.max(0, Math.min(1, xpRatio)) * 100}%`;
    this.xpText.textContent = `${Math.floor(player.xp)} / ${player.xpToNext}`;
    this.levelText.textContent = String(player.level);
    this.killsText.textContent = String(game.kills);
    this.timerText.textContent = formatTime(game.time);
    if (player.weaponId === "crossbow") {
      this.weaponStake.textContent = `Crossbow ×${player.projectileCount}`;
    } else {
      this.weaponStake.textContent = `Stake ×${player.projectileCount}`;
    }
    if (player.censer.owned) {
      this.weaponCenser.textContent = `Lantern ×${player.censer.orbs}`;
      this.weaponCenser.classList.remove("locked");
    } else {
      this.weaponCenser.textContent = "Lantern";
      this.weaponCenser.classList.add("locked");
    }
    if (player.pyre.owned) {
      this.weaponPyre.textContent = `Holy Water ×${player.pyre.charges}`;
      this.weaponPyre.classList.remove("locked");
    } else {
      this.weaponPyre.textContent = "Holy Water";
      this.weaponPyre.classList.add("locked");
    }
    if (this.weaponCross) {
      if (player.cross.owned) {
        this.weaponCross.textContent = `Cross Boomerang ×${player.cross.count}`;
        this.weaponCross.classList.remove("locked");
      } else {
        this.weaponCross.textContent = "Cross Boomerang";
        this.weaponCross.classList.add("locked");
      }
    }
    this.paintOwned(this.weaponDagger, player.dagger?.owned, `Dagger ×${player.dagger?.count || 0}`);
    this.paintOwned(this.weaponWhip, player.whip?.owned, player.whip?.both ? "Whip ×2" : "Whip ×1");
    this.paintOwned(this.weaponScythe, player.scythe?.owned, "Scythe");
    this.paintOwned(this.weaponTorch, player.torch?.owned, "Torch");
    this.paintOwned(this.weaponTome, player.tome?.owned, `Tome ×${player.tome?.count || 0}`);
    if (this.magnetReadout) {
      this.magnetReadout.textContent = `Magnet ${player.magnetRadius}`;
      this.magnetReadout.classList.toggle("armed", player.magnetStacks > 0);
    }
    this.setOmen(game.omen);
  }

  paintOwned(node, owned, label) {
    if (!node) return;
    node.textContent = label;
    node.classList.toggle("hidden", !owned);
    node.classList.toggle("locked", !owned);
  }

  setMuted(muted) {
    const button = this.muteButton;
    if (!button) return;
    button.textContent = muted ? "Muted" : "Sound on";
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.classList.toggle("is-muted", muted);
  }

  setOmen(text) {
    if (!this.omen) return;
    if (!text) {
      this.omen.textContent = "";
      this.omen.classList.add("hidden");
      return;
    }
    this.omen.textContent = text;
    this.omen.classList.remove("hidden");
  }

  showLevelUp(player, choices, onPick, time = 0) {
    this.choices.replaceChildren();
    this.levelT0 = time;
    this.levelSelected = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.levelViews = choices.map((upgrade, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice choice-canvas";
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(CARD_W * dpr);
      canvas.height = Math.floor(CARD_H * dpr);
      canvas.style.width = `${CARD_W}px`;
      canvas.style.height = `${CARD_H}px`;
      canvas.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "choice-sr";
      name.textContent = upgrade.name;
      button.append(canvas, name);
      button.addEventListener("click", () => onPick(index));
      button.addEventListener("pointerenter", () => {
        this.levelSelected = index;
      });
      this.choices.append(button);
      return { canvas, card: presentCard(upgrade, player, index), dpr };
    });
    this.setMode("levelup");
    this.paintLevelCards(time);
  }

  paintLevelCards(time) {
    if (!this.levelViews) return;
    const t = Math.max(0, time - this.levelT0);
    for (let index = 0; index < this.levelViews.length; index += 1) {
      const view = this.levelViews[index];
      const ctx = view.canvas.getContext("2d");
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, CARD_W, CARD_H);
      CardIcons.drawCard(ctx, view.card, 0, 0, CARD_W, CARD_H, index === this.levelSelected, t);
    }
  }

  clearLevelCards() {
    this.levelViews = null;
    if (this.choices) this.choices.replaceChildren();
  }

  showGameOver(stats) {
    this.summary.replaceChildren();
    const rows = [
      ["Survived", formatTime(stats.time)],
      ["Level", String(stats.level)],
      ["Kills", String(stats.kills)],
    ];
    if (stats.weapons) rows.push(["Weapons", stats.weapons]);
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
      const desc = document.createElement("dd");
      desc.textContent = value;
      this.summary.append(term, desc);
    }
    this.setMode("gameover");
  }

  showDawn(stats) {
    if (!this.winSummary) return;
    this.winSummary.replaceChildren();
    const rows = [
      ["Survived", formatTime(stats.time)],
      ["Kills", String(stats.kills)],
      ["Level", String(stats.level)],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
      const desc = document.createElement("dd");
      desc.textContent = value;
      this.winSummary.append(term, desc);
    }
    this.setMode("victory");
  }
}

function presentCard(upgrade, player, index) {
  const icon = typeof upgrade.icon === "function"
    ? upgrade.icon(player)
    : (upgrade.icon || upgrade.family || upgrade.id);
  const maxLevel = upgrade.ranks || 0;
  return {
    id: upgrade.id,
    weapon: icon,
    title: upgrade.name,
    desc: `${upgrade.blurb}\n${upgrade.detail(player)}`,
    isNew: upgrade.kind === "unlock",
    level: maxLevel && upgrade.level ? upgrade.level(player) : 0,
    maxLevel,
    index,
    kind: upgrade.family || "boon",
  };
}
