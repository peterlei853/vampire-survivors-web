# vampire-survivors-web

Nightfall is a Vampire Survivors–inspired survival roguelite that runs in the browser. v0.5.2 is a playable night: move with the keyboard or a touch stick, auto-attack with a stake, an unlockable censer, pyre, and ash cross, pull gems in with a magnet boon, level up, and survive a spawn curve that starts sparse, thickens, and brings a warden around the second minute and again later. Last until dawn at ten minutes. The hunter and the ground are PixelLab pixel art. Weapons, impacts, and gems are CC0 sprites from OpenGameArt, listed in [assets/CREDITS.md](assets/CREDITS.md).

This is an original prototype. It is not affiliated with poncle or Vampire Survivors.

## Play

The Godot port is the page at [https://peterlei853.github.io/vampire-survivors-web/](https://peterlei853.github.io/vampire-survivors-web/). The original canvas game stays at [https://peterlei853.github.io/vampire-survivors-web/classic/](https://peterlei853.github.io/vampire-survivors-web/classic/). Each page links to the other.

GitHub Pages publishes that site from the `pages` workflow on every push to `main` (and when the workflow is run by hand). The repository Pages source has to be **GitHub Actions**.

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

## Godot

A native port of the same night is in [`godot/`](godot/). It is GDScript only (no C#, no addons) and uses the **Compatibility** renderer so it can run on a laptop with integrated graphics. Open it in **Godot 4.3 or newer**. This port was checked with Godot 4.7.2. The canvas sources at the repo root are unchanged; the Pages artifact copies them to `/classic/`.

The web export preset is **Web**, with thread support off (`variant/thread_support=false`). That is the single-threaded build, so the page does not need `SharedArrayBuffer` or COOP/COEP headers. GitHub Pages cannot set those headers. The workflow downloads Godot 4.7.2 and the matching export templates, exports with `--headless`, and deploys with the official Pages actions. Audio starts after a click or a key press. The canvas takes keyboard focus when the engine starts, and **Enter** begins the night.

On Windows: install Godot 4 from [godotengine.org](https://godotengine.org/download), choose **Import** (or Open), and select `godot/project.godot`. Press **F5** to play. Click the game view if the keys do not respond. The Compatibility renderer is already set in the project.

From a machine with a Godot 4 binary on `PATH`:

```bash
godot --path godot
```

Headless check, from the repo root:

```bash
godot --headless --path godot --import
godot --headless --path godot --quit-after 30
godot --headless --path godot -s res://scripts/smoke_runner.gd
```

The smoke script loads the main scene, moves the hunter, confirms the opening enemies, lets the stake get a kill, and collects gems until the first level-up. It also checks that Warding Censer, Cinder Pyre, and Ash Cross stay on the table until taken, and that the warden telegraph can spawn.

Controls match the browser build: **WASD** or arrows, a virtual stick on touch screens (hidden for a mouse until a finger is down), **1 / 2 / 3** to pick a boon, **Enter** to begin and to rise again, **M** to mute. Mute is remembered in `user://nightfall.cfg` (Godot's equivalent of the browser `nightfall-muted` flag).

The title reads **吸血鬼獵人 / Nightfall**. Chinese glyphs come from a SIL Open Font License subset of Noto Sans TC in `godot/assets/fonts/`. If that file cannot be loaded, or the font has no CJK glyphs, the title falls back to **Vampire Hunter** and the engine may still use a system font for missing characters.

Not in this port: the browser hook `window.__game`, pausing when a browser tab is hidden (the native window keeps running, and a frame is still capped at 0.05s), gamepad, and the same later features the web build does not have yet (chests, evolutions, obstacles, biomes, meta progression). Characters and cues are still drawn and synthesized in code.

## Tests

Smoke coverage lives under `qa/`. It drives the page in Chromium and asserts through `window.__game` / `weaponSummary()`. The document title pin matches v0.5.2. How to run it is in [qa/README.md](qa/README.md).

```bash
npm install
npx playwright install chromium
npm test
```

## How to play

1. Choose **Begin the night** (or press Enter) and pick a hunter. **Enter** confirms. **Rise again** repeats that hunter; **C** or **Choose another** returns to the cards.
2. Move with **WASD** or the **arrow keys**. On a phone or other coarse pointer, a stick sits on the left; drag it to move. Keys win if you press them while the stick is held. The stake aims and fires on its own at the nearest foe.
3. Enemies walk in from off-screen and chase you. The first half-minute is shamblers only. Bats arrive after about 30 seconds, brutes after about 75. Contact hurts. You get a short invulnerability blink after each hit.
4. Fallen enemies drop gems. Nearby gems pull in immediately (pull radius 110 until you take a magnet). Gems left behind start homing after a short delay so a long kite still pays off. Picking them up grants XP. **Grave Magnet** widens that pull in steps of 42, up to 320 (110, 152, 194, 236, 278, 320). A faint ring shows the new reach. The pickup bite itself stays 22.
5. Filling the XP bar levels you up and pauses the night. Pick one of three boons (click, or press **1**, **2**, or **3**). A level also restores a little health. **Warding Censer**, **Cinder Pyre**, and **Ash Cross** each stay on the table until you take that weapon. Later boons add censers, flasks, crosses, heat, or reach. Stake boons still sharpen the bolts. Grave Magnet can show up in a free slot.
6. The pyre throws a flask at the nearest foe. It arcs, then leaves a pool that ticks damage on anyone still standing in it. It does not aim like the stake or sweep like the censer. The ash cross is a fourth weapon: it flies out along the nearest foe and cuts again on the way back.
7. Once the night reaches 90 seconds, the **Warden** is coming. A quiet run gets the warning at 100 seconds. A run with 80 kills can get it as soon as 90. A red sigil marks the spot for 2.4 seconds, then the warden steps out of it. It is slow, it is labeled, and every few seconds it paints a circle where you are standing. The circle does not follow you. Leave it before it bursts. Killing the warden drops a large gem and a ring of smaller ones. It returns on a fixed clock (220s, 340s, 460s, …). Each later body has 1.25× the previous generation's base HP, on top of the night's HP scale. **F3** toggles an FPS and enemy-count readout (off until you press it).
8. Spawn rate, batch size, and the crowd cap rise with time, plus a smaller share of your kills. The crowd ceiling is 140 until 4:00, 180 until 6:00, and 220 after. A spawn batch is capped at 5, then 6, then 7 on that same clock. At 4:00 a line of 30 bats enters from one edge, at 6:00 a ring of 12 brutes closes in, and at 8:00 a mixed wave of 40 arrives. Those waves are added on top of whoever is already here. They count toward the crowd cap afterward, and ordinary spawns wait until the total is under the ceiling again. If a normal foe is removed because the crowd is full, its XP is added to the nearest gem (or dropped, if the ground is empty). The warden is not culled when the crowd is full and is not dropped for running far away. At 0 HP the run ends. Surviving to 10:00 shows **Dawn breaks** once you are in play again (a level-up card finishes first) and pauses the night, even if a warden is still standing. **Enter** starts another. **Rise again**, **Enter**, or **R** also starts a new night after you fall.
9. **M** or the **Sound on** button mutes hit, gem, level-up, and death cues. The choice is remembered in `localStorage` when the browser allows it. If audio is blocked, the night keeps going with no sound and no error.

HUD, from the top: kills and version, survival timer, omen line, weapon chips, level. Along the bottom: HP, then XP. The censer, pyre, and cross chips stay dim until you wake them. The magnet chip always shows the current pull radius and lights up after the first Grave Magnet. Mute sits under the level. The touch stick is hidden on a mouse until a finger is actually down.

## Layout

- `index.html` — shell, HUD, level-up, and game-over UI
- `css/style.css` — layout and theme
- `js/main.js` — boot, art preload, and overlay shortcuts
- `js/art.js` — PixelLab hunter, enemy sheets, graveyard tiles, and baked decorations
- `js/fxart.js` — CC0 weapon, impact, and gem sprites
- `js/game.js` — loop, spawn curve, combat, warden timing, camera, upgrade choices
- `js/player.js` — movement, stats, XP curve, facing, and the walk cycle
- `assets/` — PixelLab hunter (`player_sheet.png`), fallback floor (`tileset.png`), enemy sheets (`assets/enemies/`), graveyard floor (`assets/tiles/`), and decorations (`assets/decor/`)
- `assets/oga/` — CC0 weapon, impact, and gem sprites. Credits are in [assets/CREDITS.md](assets/CREDITS.md)
- `js/censer.js` — orbiting warding censer
- `js/pyre.js` — cinder pyre flasks and burning pools
- `js/cross.js` — ash cross and its returning bolts
- `js/audio.js` — Web Audio cues and mute
- `js/enemy.js` — shamblers, bats, brutes, and the warden. The first three draw from PixelLab sheets; the warden stays shape-drawn
- `js/projectile.js` — auto-aimed stakes
- `js/gem.js` — XP pickups and magnet pull
- `js/ui.js` — HUD and overlays
- `js/input.js` — WASD / arrow state and the touch stick

Tune feel in `js/player.js` (XP curve, stake stats, magnet steps), `js/censer.js` (sweep damage and reach), `js/pyre.js` (pool damage, radius, and flask count), `js/cross.js` (cross damage, count, and flight), `js/enemy.js` (type stats, warden slam), and `nightThreat`, `eliteDue`, and the spawn helpers in `js/game.js`.

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

## v0.4.0 notes for Engineer and QA

Still true from v0.3.0: the 40 XP leave-level-1 curve, the eased spawn ramp, censer and pyre unlocks, mute, and one Warden per night (`eliteDue` still false before 90s, 80 kills to open the window, otherwise 100s). Those numbers were not retuned.

New in this build:

- **Touch stick.** On a coarse pointer the stick rests at the lower left during a run. A touch in the left half places it under the finger and the knob follows, with a small dead zone. A mouse does not show it unless a real touch is down. WASD and arrows replace the stick vector while any of those keys are held. `input.touch` exposes `active`, `visible`, `coarse`, `x`, and `y`.
- **Grave Magnet** was already a boon. It now reports through the HUD (`Magnet 175` until taken, then the new radius, lit once stacked) and through `weaponSummary().magnet` (`radius`, `pickupRadius`, `stacks`). Steps are +48 from 175, capped at 320. Pickup radius stays 22. A dashed ring marks the reach after the first rank.
- **Ash Cross** is the fourth auto-weapon. It stays on the level-up row until taken, like the censer and the pyre. Bolts fly toward the nearest foe and return to you, damaging on both passes. Later boons add crosses (max 3), damage (10, then +4 up to 22), or flight (210, then +36 up to 320). The chip is dim until owned, then `Cross ×N`. `weaponSummary().cross` is `owned`, `count`, `damage`, `range`, `interval`.
- `applyUpgrade(id)` applies one catalog boon by id and returns false when it is missing, locked, or maxed. Level-up cards use the same objects.

Not in this build yet:

- Chests, evolutions, obstacles, or biomes
- Gamepad
- Meta progression, accounts, or save data beyond the mute flag
- The smoke suite in `qa/` is the automated check; it does not replace a longer play session
- Sprite art or recorded samples; characters, fire, and sound are generated in the page

## v0.5.0 notes for Engineer and QA

Still true from v0.4.0: the touch stick, Grave Magnet, Ash Cross, mute, the 40 XP first level, the spawn ramp, and one Warden per night. Hitbox radius stays 14. Combat numbers were not retuned.

New in this build:

- **Pixel-art hunter.** The player is drawn from `assets/player_sheet.png`, generated with [PixelLab](https://pixellab.ai). The sheet is 7 columns by 8 rows of 68×68. Rows are south, south-east, east, north-east, north, north-west, west, south-west. Column 0 is idle. Columns 1–6 are a walk cycle at about 10 frames per second, played only while the movement axis is held. Facing is 8-way from that vector and stays on the last direction when you stop. Scaling is nearest-neighbor (`imageSmoothingEnabled = false`). The 68px cell is drawn a little over native size so she is about 66px tall at 1280×720, centred on the hitbox. The hitbox radius stays 14. A soft shadow sits under her feet. `player.facing` is the row name (`east`, `west`, …). If the sheet fails to load, the previous shape-drawn hunter is used.
- **Graveyard ground.** The flat fill is replaced by a camera-following PixelLab top-down Wang tileset (`assets/tileset.png`, metadata in `assets/tileset_metadata.json`): dark mossy dirt, with deterministic cobblestone patches hashed from world tile coordinates and transition tiles from each tile's `bounding_box`. Visible chunks are cached. A dark overlay and the existing vignette keep the night readable so enemies and projectiles still stand out. If the tileset fails to load, the old dotted background is used.
- Images are preloaded in `js/main.js` before `window.__game` is published and before the frame loop starts. `window.__game.sprites.player` is the loaded sheet (or null).
- **Weapon sprites.** The stake, warding censer, cinder pyre (flask and pool), and ash cross, plus hit puffs and XP gems, are drawn from CC0 pixel art in `assets/oga/`. Bolts and the pyre flask rotate to their travel direction. The cross spins. On screen the stake and flask are about 28–32px, the ash cross about 32px of artwork inside a slightly larger cell, the censer orb 24px, and gems 14–16px. Hitboxes and damage are unchanged. If a sprite fails to load, that effect falls back to the old shape. Sources, authors, and the CC0 license are in [assets/CREDITS.md](assets/CREDITS.md).

## v0.5.1 notes for Engineer and QA

Tuning pass on the v0.5.0 night, plus PixelLab foes, a graveyard floor, and baked decorations. Weapons and the touch stick are unchanged.

- Crowd ceiling in `maxEnemiesFor` is still `min(ceiling, round(12 + threat * 14))`. The ceiling is 140 before 4:00, 180 before 6:00, and 220 after. `spawnCountFor` uses the same clock for its batch cap: 5, then 6, then 7.
- Enemy HP scale in `Enemy` is `1 + max(0, t - 30) / 220`. Speed and damage scales are unchanged. Bat chase speed is capped at 200 (absolute; the hunter's base speed is 168, so two Fleet Foot picks can outrun a bat).
- One-shot swarms: 30 bats along one screen edge at 4:00, 12 brutes in a ring at 6:00, 40 mixed foes (shambler, bat, brute) at 8:00. The wave does not evict anyone to make room. The new bodies count toward the cap, and `spawnBatch` waits until `enemies.length` is under `maxEnemies()` again. They are marked `swarm` so a cap cull will not pick them.
- The first warden keeps the v0.5.0 window (`eliteDue`: not before 90s; at 90s if kills are at least 80; otherwise 100s). Later warnings are due at 220s, 340s, 460s, … (`100 + appearance * 120`). Base HP is multiplied by `1.25` per generation (`1`, `1.25`, `1.5625`, …) and then by the usual HP scale. One warden fight at a time; if the previous body is still up at the next timestamp, the next warning starts as soon as it falls.
- Surviving to 600s opens **Dawn breaks** (`state === "victory"`) only while `state` is `playing` and no level-up is waiting. If cards are open, the win runs as soon as the last card closes. A living warden does not block it. The simulation does not advance behind that sheet. **Enter** or **Rise again** calls the same restart as a fallen run.
- Sharpened Stake sets `damage = round(damage * 1.2)`. Hasty Ritual cannot push the attack interval below 0.25s. Grave Magnet starts at 110 and adds 42 up to 320.
- `cullOneForCap` merges the removed foe's XP into the nearest gem, or drops a gem on that spot. `trimGems` folds overflow gem XP into the gem closest to the hunter, so a later gem cap does not throw that value away.
- **F3** toggles `#perf` (FPS and live enemy count). It stays off until pressed, including across a restart.
- Bats, shamblers, and brutes draw from `assets/enemies/{bat,shambler,brute}_sheet.png` (8 facing rows, nearest-neighbor). `bodyBox` width is the hit diameter and its centre sits on the collision point. A short vertical bob stands in for the single walk frame. Damage flashes a cached white copy of the sheet. If a sheet fails to load, that type keeps the old circle. The warden is still drawn in code.
- The floor prefers `assets/tiles/tileset_graveyard.png`, sliced by each tile's `bounding_box`, through the same cached 8×8 chunks. `assets/tileset.png` is the fallback. About one tile in forty bakes a decoration from `assets/decor/` into that chunk (gravestone, candle, and shrub more often than bones or a buried skull). Decorations do not collide.

Not in this build yet:

- Chests, evolutions, obstacles, or biomes
- Gamepad
- Meta progression, accounts, or save data beyond the mute flag
- Recorded audio samples; cues are still synthesized. The warden is still drawn in code

## v0.5.2 notes for Engineer and QA

Stacks on the v0.5.1 night. Two hunters, chosen before the run.

- `js/characters.js` holds the table. `hunter` is the current body (100 HP, speed 168, stake 12, every 0.56s, pierce 0). `warden_hunter` displays as **The Stakeman** (130 HP, speed 150, stake 16, every 0.68s, pierce 1). The stake is the same weapon. Sharpened Stake, Hasty Ritual (floor 0.25s), and Fleet Foot still multiply the live stat, so they scale from whichever base you brought in.
- Art for the Stakeman loads from `assets/characters/stakeman/` (`player_sheet.png` or `sheet.png`, plus JSON) in the hunter sheet layout: 80×80 cells, eight facings, six walk frames. `sheet.ready` stays false until those files are in the tree, so the page does not 404. Either way a missing image draws the hunter sheet darker and the run still starts.
- The title's **Begin the night**, **Enter**, and **Space** open the select screen. The night does not spawn there. Cards sit side by side, each looping a south walk, with a one-line identity and HP / speed / damage / attack-rate bars scaled to the higher of the two (no numbers on the bars). The Stakeman card adds a Pierce 1 tag. **Left** / **Right** or **A** / **D** or a click moves the highlight (1.1× ease-out, pale glow, a soft tick). **Enter**, **Space**, or a click on the highlighted card confirms: a short white flash, then the run.
- **Rise again**, **Enter**, and **R** restart the last hunter. **C** or **Choose another** on the fallen or dawn sheet returns to select. The id is `localStorage` key `nightfall.character`. A missing or unknown value is `hunter`.
- `window.__begin(characterId)` is the single start used by those buttons and keys.
