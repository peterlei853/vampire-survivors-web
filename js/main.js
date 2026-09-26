/** Boots Nightfall and binds the menu, level-up, and restart keys. */

import { loadArt } from "./art.js";
import { Game } from "./game.js";
import { Input } from "./input.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("game");
const input = new Input();
const ui = new UI();
const game = new Game(canvas, input, ui);
const art = await loadArt();
game.setArt(art);

// Live handle for QA scripts. Not a save file and not a secret.
// Useful fields: state, time, kills, player (xp, level, facing, censer, pyre, cross),
// enemies, eliteState, spawnInterval(), input.touch (stick visible / vector),
// sprites.player (loaded sheet), weaponSummary() (stake, censer, pyre, cross,
// magnet, elite, threat), applyUpgrade(id), toggleMute().
window.__game = game;
ui.setMuted(game.audio.muted);

function begin() {
  game.audio.unlock();
  game.start();
  canvas.focus();
}

document.getElementById("btn-start").addEventListener("click", begin);
document.getElementById("btn-restart").addEventListener("click", begin);
document.getElementById("btn-dawn").addEventListener("click", begin);
document.getElementById("btn-mute").addEventListener("click", () => game.toggleMute());

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "F3") {
    event.preventDefault();
    game.togglePerf();
    return;
  }
  if (event.code === "KeyM") {
    event.preventDefault();
    game.toggleMute();
    return;
  }
  if (game.state === "menu" && (event.code === "Enter" || event.code === "Space")) {
    event.preventDefault();
    begin();
  } else if (game.state === "levelup" && /^Digit[1-3]$/.test(event.code)) {
    game.chooseUpgrade(Number(event.code.slice(5)) - 1);
  } else if (game.state === "gameover" && (event.code === "Enter" || event.code === "KeyR")) {
    begin();
  } else if (game.state === "victory" && event.code === "Enter") {
    event.preventDefault();
    begin();
  }
});

window.addEventListener("resize", () => game.resize());
game.resize();
ui.setMode("menu");
requestAnimationFrame((timestamp) => game.frame(timestamp));
