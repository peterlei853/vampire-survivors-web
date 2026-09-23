# vampire-survivors-web

Nightfall is a Vampire Survivors–inspired survival roguelite that runs in the browser. v0.1.0 is a playable core loop: move, auto-attack, collect gems, level up, and survive until you fall.

This is an original prototype. It is not affiliated with poncle or Vampire Survivors.

## Run

The client is HTML, CSS, and JavaScript modules. Load it through a static server. Opening `index.html` via `file://` will not start the game, because browsers block ES modules there.

From the repo root:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

The same server is wired as an npm script (no install):

```bash
npm start
```

## How to play

1. Choose **Begin the night** (or press Enter).
2. Move with **WASD** or the **arrow keys**. The stake aims and fires on its own at the nearest foe.
3. Enemies walk in from off-screen and chase you. Contact hurts. You get a short invulnerability blink after each hit.
4. Fallen enemies drop gems. Nearby gems pull in immediately. Gems left behind start homing after a short delay so a long kite still pays off. Picking them up grants XP.
5. Filling the XP bar levels you up and pauses the night. Pick one of three boons (click, or press **1**, **2**, or **3**). A level also restores a little health.
6. Spawn rate, enemy mix, and enemy strength rise as the timer climbs. At 0 HP the run ends. **Rise again**, **Enter**, or **R** starts a new night.

HUD, from the top: kills, survival timer, level. Along the bottom: HP, then XP.

## Layout

- `index.html` — shell, HUD, level-up, and game-over UI
- `css/style.css` — layout and theme
- `js/main.js` — boot and overlay shortcuts
- `js/game.js` — loop, spawning, combat, camera, upgrade choices
- `js/player.js` — movement, stats, XP curve
- `js/enemy.js` — shamblers, bats, and brutes
- `js/projectile.js` — auto-aimed stakes
- `js/gem.js` — XP pickups and magnet pull
- `js/ui.js` — HUD and overlays
- `js/input.js` — WASD / arrow state

Tune feel in `js/player.js` (speed, damage, fire rate), `js/enemy.js` (type stats), and the spawn helpers in `js/game.js`.

## Branch workflow

| Branch | Who | Purpose |
| --- | --- | --- |
| `feature/core-gameplay` | Engineers | Gameplay implementation and iteration |
| `qa/test-scripts` | QA | Test scripts and verification notes |
| `main` | Manager | Integration branch |

Engineers work on `feature/core-gameplay` and open a pull request. QA works on `qa/test-scripts`. **`main` is merged only by the Manager, and only when the build scores at least 4/5.**

## v0.1.0 notes for Engineer and QA

In this build:

- One auto-aimed stake weapon, with level-up boons for damage, fire rate, extra bolts, pierce, move speed, magnet radius, and max HP
- Three chasing enemy types and a timer that speeds up spawns
- Gems, an XP curve, a pausing upgrade pick, HUD, game over, and restart
- `window.__game` is a live handle (`state`, `player`, `enemies`, `gems`, `kills`, `time`) for manual checks. It is not persisted and holds no secrets

Not in this build yet:

- Extra weapons, chests, evolutions, bosses, obstacles, or biomes
- Audio, touch controls, or gamepad
- Meta progression, accounts, or save data
- An automated suite on this branch (`qa/test-scripts` is the QA home for that)
- Sprite art; characters and effects are drawn on the canvas

Balance is a first pass so the first level arrives after a handful of kills and standing still eventually loses.
