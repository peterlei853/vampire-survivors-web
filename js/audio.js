/** Short Web Audio cues. Silent if the context is missing, blocked, or closed. */

const HIT_GAP = 0.07;
const GEM_GAP = 0.05;

export class AudioBus {
  constructor() {
    this.muted = readMuted();
    this.ctx = null;
    this.master = null;
    this.lastHit = 0;
    this.lastGem = 0;
    this.unlocked = false;
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeMuted(this.muted);
    if (this.master) {
      try {
        this.master.gain.value = this.muted ? 0 : 0.2;
      } catch {
        /* a closed context should not surface */
      }
    }
    if (!this.muted) this.unlock();
    return this.muted;
  }

  /** Call from a click or key so the browser will allow sound. */
  unlock() {
    this.unlocked = true;
    if (this.muted) return;
    if (!this.ensure()) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  ensure() {
    if (this.ctx) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.2;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      this.ctx = null;
      this.master = null;
      return false;
    }
  }

  play(kind) {
    if (this.muted || !this.unlocked) return;
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
      return;
    }
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    try {
      if (kind === "hit") {
        if (now - this.lastHit < HIT_GAP) return;
        this.lastHit = now;
        tone(ctx, this.master, now, 220, 90, 0.045, "square", 0.07);
      } else if (kind === "hurt") {
        tone(ctx, this.master, now, 130, 48, 0.14, "square", 0.09);
      } else if (kind === "gem") {
        if (now - this.lastGem < GEM_GAP) return;
        this.lastGem = now;
        tone(ctx, this.master, now, 760, 1180, 0.07, "sine", 0.05);
      } else if (kind === "level") {
        tone(ctx, this.master, now, 523, 523, 0.08, "triangle", 0.06);
        tone(ctx, this.master, now + 0.09, 659, 659, 0.08, "triangle", 0.06);
        tone(ctx, this.master, now + 0.18, 784, 1046, 0.16, "triangle", 0.07);
      } else if (kind === "death") {
        tone(ctx, this.master, now, 196, 52, 0.55, "sawtooth", 0.06);
      }
    } catch {
      /* blocked or half-closed audio never breaks the night */
    }
  }
}

function tone(ctx, master, when, from, to, dur, type, gain) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + dur);
  amp.gain.setValueAtTime(gain, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function readMuted() {
  try {
    return localStorage.getItem("nightfall-muted") === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    localStorage.setItem("nightfall-muted", muted ? "1" : "0");
  } catch {
    /* private mode keeps the choice for this page only */
  }
}
