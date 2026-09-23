/** Boots Nightfall and binds the menu, level-up, and restart keys. */

import { Game } from "./game.js";
import { Input } from "./input.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("game");
const input = new Input();
const ui = new UI();
const game = new Game(canvas, input, ui);

// Live handle for QA scripts. Not a save file and not a secret.
window.__game = game;

function begin() {
  game.start();
  canvas.focus();
}

document.getElementById("btn-start").addEventListener("click", begin);
document.getElementById("btn-restart").addEventListener("click", begin);

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (game.state === "menu" && (event.code === "Enter" || event.code === "Space")) {
    event.preventDefault();
    begin();
  } else if (game.state === "levelup" && /^Digit[1-3]$/.test(event.code)) {
    game.chooseUpgrade(Number(event.code.slice(5)) - 1);
  } else if (game.state === "gameover" && (event.code === "Enter" || event.code === "KeyR")) {
    begin();
  }
});

window.addEventListener("resize", () => game.resize());
game.resize();
ui.setMode("menu");
requestAnimationFrame((timestamp) => game.frame(timestamp));
