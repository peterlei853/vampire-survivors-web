# vampire-survivors-web

Nightfall is a Vampire Survivors–inspired survival roguelite that runs in the browser. v0.2.0 is a playable night: move, auto-attack with a stake and an unlockable censer, collect gems, level up, and survive a spawn curve that starts sparse and thickens.

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

## Tests

Smoke coverage for v0.2.0 lives on `qa/test-scripts` under `qa/`. It drives the page in Chromium and asserts through `window.__game` / `weaponSummary()`. How to run it is in [qa/README.md](qa/README.md).

```bash
npm install
npx playwright install chromium
npm test
```

## How to play

1. Choose **Begin the night** (or press Enter).
2. Move with **WASD** or the **arrow keys**. The stake aims and fires on its own at the nearest foe.
3. Enemies walk in from off-screen and chase you. The first half-minute is shamblers only. Bats arrive after about 30 seconds, brutes after about 75. Contact hurts. You get a short invulnerability blink after each hit.
4. Fallen enemies drop gems. Nearby gems pull in immediately. Gems left behind start homing after a short delay so a long kite still pays off. Picking them up grants XP.
5. Filling the XP bar levels you up and pauses the night. Pick one of three boons (click, or press **1**, **2**, or **3**). A level also restores a little health. **Warding Censer** is one of the three choices on every level-up until you take it. Later boons add censers, heat, or reach. Stake boons still sharpen the bolts.
6. Spawn rate, batch size, and the crowd cap rise with time, plus a smaller share of your kills. At 0 HP the run ends. **Rise again**, **Enter**, or **R** starts a new night.

HUD, from the top: kills and version, survival timer with weapon chips, level. Along the bottom: HP, then XP. The censer chip stays dim until you wake one.

## Layout

- `index.html` — shell, HUD, level-up, and game-over UI
- `css/style.css` — layout and theme
- `js/main.js` — boot and overlay shortcuts
- `js/game.js` — loop, spawn curve, combat, camera, upgrade choices
- `js/player.js` — movement, stats, XP curve
- `js/censer.js` — orbiting warding censer
- `js/enemy.js` — shamblers, bats, and brutes
- `js/projectile.js` — auto-aimed stakes
- `js/gem.js` — XP pickups and magnet pull
- `js/ui.js` — HUD and overlays
- `js/input.js` — WASD / arrow state

Tune feel in `js/player.js` (XP curve, stake stats), `js/censer.js` (sweep damage and reach), `js/enemy.js` (type stats), and `nightThreat` / the spawn helpers in `js/game.js`.

## Branch workflow

| Branch | Who | Purpose |
| --- | --- | --- |
| `feature/core-gameplay` | Engineers | Gameplay implementation and iteration |
| `qa/test-scripts` | QA | Test scripts and verification notes |
| `main` | Manager | Integration branch |

Engineers work on `feature/core-gameplay` and open a pull request. QA works on `qa/test-scripts`. **`main` is merged only by the Manager, and only when the build scores at least 4/5.**

## v0.2.0 notes for Engineer and QA

In this build:

- Two auto weapons. The stake is owned from the start. The **Warding Censer** is unlocked and upgraded from level-up boons. Its spokes sweep a circle and burn enemies they pass, including ones in melee.
- XP to leave level 1 is 40 (twenty shambler gems). The cost then bends upward (`40 + 18n + 2.2n²`, `n` = level − 1) so the first level is a short fight and a few minutes of play still reaches the mid levels.
- Spawn pressure eases in. Opening cap is about a dozen, interval about 1.7s, one enemy per wave, shamblers only, four already on the walk in. The first minute stays in that band. By two minutes the interval, batch size, and cap have climbed, and after that the field fills toward a cap of 140. Kills contribute, but that term is capped so a fast start cannot flood the opening.
- `window.__game` is a live handle for manual checks. It is not persisted and holds no secrets. Besides `state`, `player`, `enemies`, `gems`, `kills`, and `time`, `weaponSummary()` returns stake stats, censer stats, and the current threat value. `player.censer` is the weapon itself (`owned`, `orbs`, `damage`, `radius`).

Not in this build yet:

- Chests, evolutions, bosses, obstacles, or biomes
- Audio, touch controls, or gamepad
- Meta progression, accounts, or save data
- The smoke suite in `qa/` is the automated check; it does not replace a longer play session
- Sprite art; characters and effects are drawn on the canvas
