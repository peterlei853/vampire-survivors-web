/** Keyboard movement, plus a left-side touch stick on coarse pointers. */

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
    this.stickPlaying = false;
    this.pointerId = null;
    this.knobX = 0;
    this.knobY = 0;
    /** QA handle. `x` / `y` are the stick vector in -1..1. Keyboard wins in `axis()`. */
    this.touch = {
      active: false,
      visible: false,
      coarse: window.matchMedia("(pointer: coarse)").matches,
      x: 0,
      y: 0,
    };
    this.stickEl = document.getElementById("stick");
    this.knobEl = document.getElementById("stick-knob");

    window.addEventListener("keydown", (event) => {
      this.down.add(event.code);
      if (MOVE_CODES.has(event.code) || event.code === "Space") {
        event.preventDefault();
      }
    });
    window.addEventListener("keyup", (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
      this.releaseTouch();
    });

    const coarseQuery = window.matchMedia("(pointer: coarse)");
    coarseQuery.addEventListener("change", () => {
      this.touch.coarse = coarseQuery.matches;
      this.syncVisibility();
    });

    window.addEventListener("pointerdown", (event) => this.onPointerDown(event), { passive: false });
    window.addEventListener("pointermove", (event) => this.onPointerMove(event), { passive: false });
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    window.addEventListener("resize", () => {
      if (!this.touch.active) this.placeResting();
    });

    this.syncVisibility();
  }

  /** The night shows the stick only while a run is actually moving. */
  setStickContext(playing) {
    const was = this.stickPlaying;
    this.stickPlaying = playing;
    if (!playing && this.touch.active) this.releaseTouch();
    if (was !== playing) this.syncVisibility();
  }

  keyHeld() {
    for (const code of MOVE_CODES) {
      if (this.down.has(code)) return true;
    }
    return false;
  }

  keyAxis() {
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

  /**
   * Movement axis. A held WASD / arrow key replaces the stick, even if the
   * keys cancel out, so a finger on the stick cannot fight the keyboard.
   */
  axis() {
    if (this.keyHeld()) return this.keyAxis();
    if (this.touch.active) return { x: this.touch.x, y: this.touch.y };
    return { x: 0, y: 0 };
  }

  maxRadius() {
    return Math.min(window.innerWidth, window.innerHeight) < 760 ? 64 : 52;
  }

  restingOrigin() {
    const narrow = window.innerWidth < 760;
    const x = narrow ? 96 : 112;
    const y = window.innerHeight - (narrow ? 196 : 172);
    return {
      x: Math.max(78, Math.min(x, window.innerWidth * 0.36)),
      y: Math.max(110, Math.min(y, window.innerHeight - 110)),
    };
  }

  onPointerDown(event) {
    if (!this.stickPlaying || this.touch.active) return;
    if (event.pointerType !== "touch") return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, select")) return;
    if (event.clientX > window.innerWidth * 0.52) return;
    const origin = this.clampOrigin(event.clientX, event.clientY);
    this.touch.active = true;
    this.pointerId = event.pointerId;
    this.touch.originX = origin.x;
    this.touch.originY = origin.y;
    this.updateVector(event.clientX, event.clientY);
    this.syncVisibility();
    if (event.cancelable) event.preventDefault();
  }

  onPointerMove(event) {
    if (!this.touch.active || event.pointerId !== this.pointerId) return;
    this.updateVector(event.clientX, event.clientY);
    if (event.cancelable) event.preventDefault();
  }

  onPointerUp(event) {
    if (!this.touch.active || event.pointerId !== this.pointerId) return;
    this.releaseTouch();
  }

  clampOrigin(x, y) {
    const pad = 48;
    return {
      x: Math.max(pad, Math.min(x, window.innerWidth * 0.48)),
      y: Math.max(pad, Math.min(y, window.innerHeight - pad)),
    };
  }

  updateVector(clientX, clientY) {
    const dx = clientX - this.touch.originX;
    const dy = clientY - this.touch.originY;
    const max = this.maxRadius();
    const dead = 12;
    const mag = Math.hypot(dx, dy);
    if (mag <= 0) {
      this.touch.x = 0;
      this.touch.y = 0;
      this.knobX = 0;
      this.knobY = 0;
    } else {
      const shown = Math.min(mag, max);
      const nx = dx / mag;
      const ny = dy / mag;
      this.knobX = nx * shown;
      this.knobY = ny * shown;
      if (shown <= dead) {
        this.touch.x = 0;
        this.touch.y = 0;
      } else {
        const strength = (shown - dead) / (max - dead);
        this.touch.x = nx * strength;
        this.touch.y = ny * strength;
      }
    }
    this.layoutStick();
  }

  releaseTouch() {
    if (!this.touch.active && this.touch.x === 0 && this.touch.y === 0 && this.pointerId == null) {
      this.syncVisibility();
      return;
    }
    this.touch.active = false;
    this.touch.x = 0;
    this.touch.y = 0;
    this.knobX = 0;
    this.knobY = 0;
    this.pointerId = null;
    this.syncVisibility();
    if (this.touch.visible) this.placeResting();
  }

  syncVisibility() {
    const visible = Boolean(this.stickPlaying && (this.touch.coarse || this.touch.active));
    this.touch.visible = visible;
    if (!this.stickEl) return;
    this.stickEl.classList.toggle("hidden", !visible);
    this.stickEl.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible && !this.touch.active) this.placeResting();
  }

  placeResting() {
    const origin = this.restingOrigin();
    this.touch.originX = origin.x;
    this.touch.originY = origin.y;
    this.knobX = 0;
    this.knobY = 0;
    this.layoutStick();
  }

  layoutStick() {
    if (!this.stickEl) return;
    this.stickEl.style.left = `${this.touch.originX}px`;
    this.stickEl.style.top = `${this.touch.originY}px`;
    if (this.knobEl) {
      this.knobEl.style.transform = `translate(${this.knobX}px, ${this.knobY}px)`;
    }
  }
}
