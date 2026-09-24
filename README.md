# vampire-survivors-web

Nightfall is a Vampire Survivors–inspired survival roguelite that runs in the browser. v0.3.0 is a playable night: move, auto-attack with a stake, an unlockable censer, and an unlockable pyre, collect gems, level up, and survive a spawn curve that starts sparse, thickens, and brings a warden around the second minute.

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

Smoke coverage lives under `qa/`. It drives the page in Chromium and asserts through `window.__game` / `weaponSummary()`. Six specs cover the v0.2.0 behaviors, and three more cover Cinder Pyre, mute, and the Warden. The document title pin matches v0.3.0. How to run it is in [qa/README.md](qa/README.md).

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
5. Filling the XP bar levels you up and pauses the night. Pick one of three boons (click, or press **1**, **2**, or **3**). A level also restores a little health. **Warding Censer** and **Cinder Pyre** each stay on the table until you take that weapon. Later boons add censers, flasks, heat, or reach. Stake boons still sharpen the bolts.
6. The pyre throws a flask at the nearest foe. It arcs, then leaves a pool that ticks damage on anyone still standing in it. It does not aim like the stake or sweep like the censer.
7. Once the night reaches 90 seconds, the **Warden** is coming. A quiet run gets the warning at 100 seconds. A run with 80 kills can get it as soon as 90. A red sigil marks the spot for 2.4 seconds, then the warden steps out of it. It is slow, it is labeled, and every few seconds it paints a circle where you are standing. The circle does not follow you. Leave it before it bursts. Killing the warden drops a large gem and a ring of smaller ones. It spawns once per night.
8. Spawn rate, batch size, and the crowd cap rise with time, plus a smaller share of your kills. The warden is not culled when the crowd is full and is not dropped for running far away. At 0 HP the run ends. **Rise again**, **Enter**, or **R** starts a new night.
9. **M** or the **Sound on** button mutes hit, gem, level-up, and death cues. The choice is remembered in `localStorage` when the browser allows it. If audio is blocked, the night keeps going with no sound and no error.

HUD, from the top: kills and version, survival timer, omen line, weapon chips, level. Along the bottom: HP, then XP. The censer and pyre chips stay dim until you wake them. Mute sits under the level.

## Layout

- `index.html` — shell, HUD, level-up, and game-over UI
- `css/style.css` — layout and theme
- `js/main.js` — boot and overlay shortcuts
- `js/game.js` — loop, spawn curve, combat, warden timing, camera, upgrade choices
- `js/player.js` — movement, stats, XP curve
- `js/censer.js` — orbiting warding censer
- `js/pyre.js` — cinder pyre flasks and burning pools
- `js/audio.js` — Web Audio cues and mute
- `js/enemy.js` — shamblers, bats, brutes, and the warden
- `js/projectile.js` — auto-aimed stakes
- `js/gem.js` — XP pickups and magnet pull
- `js/ui.js` — HUD and overlays
- `js/input.js` — WASD / arrow state

Tune feel in `js/player.js` (XP curve, stake stats), `js/censer.js` (sweep damage and reach), `js/pyre.js` (pool damage, radius, and flask count), `js/enemy.js` (type stats, warden slam), and `nightThreat`, `eliteDue`, and the spawn helpers in `js/game.js`.

## Branch workflow

| Branch | Who | Purpose |
| --- | --- | --- |
| `feature/core-gameplay` | Engineers | Gameplay implementation and iteration |
| `qa/test-scripts` | QA | Test scripts and verification notes |
| `main` | Manager | Integration branch |

Engineers work on `feature/core-gameplay` and open a pull request. QA works on `qa/test-scripts`. **`main` is merged only by the Manager, and only when the build scores at least 4/5.**

## v0.3.0 notes for Engineer and QA

Still true from v0.2.0:

- XP to leave level 1 is 40 (twenty shambler gems). The cost then bends upward (`40 + 18n + 2.2n²`, `n` = level − 1).
- Spawn pressure eases in. Opening cap is about a dozen, interval about 1.7s, one enemy per wave, shamblers only, four already on the walk in. The crowd still climbs toward a cap of 140. Kills contribute, and that term stays capped.
- The stake is owned from the start. The **Warding Censer** is still unlocked and upgraded from level-up boons, and it is still forced onto the card row until taken.

New in this build:

- **Cinder Pyre** is the third auto-weapon. It is not a bolt and not an orbit. Flasks arc onto the nearest foes and leave a pool that ticks. Unlock it from a boon; later boons add flasks (max 3), damage (max 12), or radius (max 78). Its HUD chip is dim until taken, then reads `Pyre ×N`.
- Light audio uses the Web Audio API only (no sound files): a throttled tick when a weapon connects, a lower thud when you are hit, a chime for gems, an arpeggio for a level-up, and a falling tone on death. **M** or **Sound on** mutes. The preference key is `nightfall-muted`. If `AudioContext` is missing or blocked, playback no-ops.
- One **Warden** per night. `eliteDue(time, kills)` is false before 90s. At 90s it becomes true if kills are at least 80; otherwise the warning starts at 100s. The sigil is the telegraph, then the body. Its slam circle is planted where you were and does not track. The drop is one 30 XP gem plus six 5 XP gems (60 XP). `eliteState` is `idle`, `warning`, `alive`, or `fallen`.
- `window.__game` is a live handle for manual checks. It is not persisted and holds no secrets. `weaponSummary()` returns stake stats, censer stats, pyre stats (`owned`, `charges`, `damage`, `radius`, `interval`), `elite` (the same string as `eliteState`), and `threat`. `player.censer` and `player.pyre` are the weapons. `toggleMute()` flips the button and the bus. `audio.muted` is the current flag.

Not in this build yet:

- Chests, evolutions, obstacles, or biomes
- Touch controls or gamepad
- Meta progression, accounts, or save data beyond the mute flag
- The smoke suite in `qa/` is the automated check; it does not replace a longer play session
- Sprite art or recorded samples; characters, fire, and sound are generated in the page
