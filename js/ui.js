/** DOM HUD, level-up cards, and the game-over sheet. */

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
    this.magnetReadout = document.getElementById("magnet");
    this.omen = document.getElementById("omen");
    this.muteButton = document.getElementById("btn-mute");
    this.startOverlay = document.getElementById("overlay-start");
    this.levelOverlay = document.getElementById("overlay-level");
    this.overOverlay = document.getElementById("overlay-over");
    this.winOverlay = document.getElementById("overlay-win");
    this.winSummary = document.getElementById("win-summary");
    this.perf = document.getElementById("perf");
    this.choices = document.getElementById("choices");
    this.summary = document.getElementById("summary");
  }

  setMode(mode) {
    const sheet = mode === "menu" || mode === "gameover" || mode === "victory";
    this.hud.classList.toggle("hidden", sheet);
    this.startOverlay.classList.toggle("hidden", mode !== "menu");
    this.levelOverlay.classList.toggle("hidden", mode !== "levelup");
    this.overOverlay.classList.toggle("hidden", mode !== "gameover");
    if (this.winOverlay) this.winOverlay.classList.toggle("hidden", mode !== "victory");
  }

  setPerfVisible(on) {
    if (!this.perf) return;
    this.perf.classList.toggle("hidden", !on);
    this.perf.setAttribute("aria-hidden", on ? "false" : "true");
  }

  setPerf(fps, enemies) {
    if (!this.perf) return;
    const shown = Number.isFinite(fps) ? Math.round(fps) : 0;
    this.perf.textContent = `FPS ${shown} · Enemies ${enemies}`;
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
    this.weaponStake.textContent = `Stake ×${player.projectileCount}`;
    if (player.censer.owned) {
      this.weaponCenser.textContent = `Censer ×${player.censer.orbs}`;
      this.weaponCenser.classList.remove("locked");
    } else {
      this.weaponCenser.textContent = "Censer";
      this.weaponCenser.classList.add("locked");
    }
    if (player.pyre.owned) {
      this.weaponPyre.textContent = `Pyre ×${player.pyre.charges}`;
      this.weaponPyre.classList.remove("locked");
    } else {
      this.weaponPyre.textContent = "Pyre";
      this.weaponPyre.classList.add("locked");
    }
    if (this.weaponCross) {
      if (player.cross.owned) {
        this.weaponCross.textContent = `Cross ×${player.cross.count}`;
        this.weaponCross.classList.remove("locked");
      } else {
        this.weaponCross.textContent = "Cross";
        this.weaponCross.classList.add("locked");
      }
    }
    if (this.magnetReadout) {
      this.magnetReadout.textContent = `Magnet ${player.magnetRadius}`;
      this.magnetReadout.classList.toggle("armed", player.magnetStacks > 0);
    }
    this.setOmen(game.omen);
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

  showLevelUp(player, choices, onPick) {
    this.choices.replaceChildren();
    choices.forEach((upgrade, index) => {
      const button = document.createElement("button");
      button.type = "button";
      let tone = "choice";
      if (upgrade.family === "censer") tone = "choice choice-weapon";
      else if (upgrade.family === "pyre") tone = "choice choice-pyre";
      else if (upgrade.family === "cross") tone = "choice choice-cross";
      else if (upgrade.family === "magnet") tone = "choice choice-magnet";
      button.className = tone;
      const key = document.createElement("span");
      key.className = "choice-key";
      key.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "choice-name";
      name.textContent = upgrade.name;
      const blurb = document.createElement("span");
      blurb.className = "choice-blurb";
      blurb.textContent = upgrade.blurb;
      const detail = document.createElement("span");
      detail.className = "choice-detail";
      detail.textContent = upgrade.detail(player);
      button.append(key, name, blurb, detail);
      button.addEventListener("click", () => onPick(index));
      this.choices.append(button);
    });
    this.setMode("levelup");
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
