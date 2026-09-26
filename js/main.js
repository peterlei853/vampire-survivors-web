/** Boots Nightfall and binds the menu, level-up, and restart keys. */

import { loadArt } from "./art.js";
import { readCharacterId, writeCharacterId } from "./characters.js";
import { Game } from "./game.js";
import { Input } from "./input.js";
import { createSelect } from "./select.js";
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
// sprites.player (loaded sheet), sprites.tileset (graveyard floor, or the
// older tileset if that image failed), sprites.enemies (bat, shambler, brute),
// weaponSummary() (stake, censer, pyre, cross,
// magnet, elite, threat), applyUpgrade(id), toggleMute().
// window.__begin(characterId) starts a run. Missing or unknown ids use the hunter.
window.__game = game;
ui.setMuted(game.audio.muted);

function begin(characterId) {
  const id = writeCharacterId(characterId || readCharacterId());
  game.audio.unlock();
  game.start(id);
  canvas.focus();
}

function openSelect() {
  game.audio.unlock();
  game.openSelect();
}

const select = createSelect(game, begin);
game.select = select;

window.__begin = begin;

document.getElementById("btn-start").addEventListener("click", openSelect);
document.getElementById("btn-confirm").addEventListener("click", () => select.confirm());
document.getElementById("btn-restart").addEventListener("click", () => begin(readCharacterId()));
document.getElementById("btn-dawn").addEventListener("click", () => begin(readCharacterId()));
document.getElementById("btn-reselect").addEventListener("click", openSelect);
document.getElementById("btn-reselect-dawn").addEventListener("click", openSelect);
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
    openSelect();
  } else if (game.state === "select" && (event.code === "ArrowLeft" || event.code === "KeyA")) {
    event.preventDefault();
    game.input.down.delete(event.code);
    select.move(-1);
  } else if (game.state === "select" && (event.code === "ArrowRight" || event.code === "KeyD")) {
    event.preventDefault();
    game.input.down.delete(event.code);
    select.move(1);
  } else if (game.state === "select" && (event.code === "Enter" || event.code === "Space")) {
    event.preventDefault();
    select.confirm();
  } else if (game.state === "levelup" && /^Digit[1-3]$/.test(event.code)) {
    game.chooseUpgrade(Number(event.code.slice(5)) - 1);
  } else if (game.state === "gameover" && event.code === "KeyC") {
    event.preventDefault();
    openSelect();
  } else if (game.state === "gameover" && (event.code === "Enter" || event.code === "KeyR")) {
    begin(readCharacterId());
  } else if (game.state === "victory" && event.code === "KeyC") {
    event.preventDefault();
    openSelect();
  } else if (game.state === "victory" && event.code === "Enter") {
    event.preventDefault();
    begin(readCharacterId());
  }
});

window.addEventListener("resize", () => game.resize());
game.resize();
ui.setMode("menu");
requestAnimationFrame((timestamp) => game.frame(timestamp));
