/** Keyboard movement. WASD and arrows share one normalized axis. */

const MOVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export class Input {
  constructor() {
    this.down = new Set();
    window.addEventListener("keydown", (event) => {
      this.down.add(event.code);
      if (MOVE_CODES.has(event.code) || event.code === "Space") {
        event.preventDefault();
      }
    });
    window.addEventListener("keyup", (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener("blur", () => this.down.clear());
  }

  axis() {
    let x = 0;
    let y = 0;
    if (this.down.has("KeyA") || this.down.has("ArrowLeft")) x -= 1;
    if (this.down.has("KeyD") || this.down.has("ArrowRight")) x += 1;
    if (this.down.has("KeyW") || this.down.has("ArrowUp")) y -= 1;
    if (this.down.has("KeyS") || this.down.has("ArrowDown")) y += 1;
    const mag = Math.hypot(x, y);
    if (mag > 0) {
      x /= mag;
      y /= mag;
    }
    return { x, y };
  }
}
