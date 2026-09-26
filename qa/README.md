# Nightfall smoke suite

Automated smoke checks for the v0.6 client. Six specs cover the v0.2.0 behaviors (the document title pin is v0.6). Three cover Cinder Pyre, mute, and the Warden. Three more cover Ash Cross, Grave Magnet, and the touch stick. One covers the PixelLab player sheet. One covers the enemy sheets and graveyard tileset, checked against each sheet's JSON. One covers the v0.5.1 tuning pass. Four cover character select. Three cover the brute hitbox, the Vampire Lord, and a 10:00 crowd at the 220 cap. One checks that each character's card and in-game sprite share a sheet and that `player_sheet` is never requested. The specs live in `qa/smoke.spec.js` and drive the real page through Chromium. Playwright starts `python3 -m http.server` on port **8099** (the dev server on 8080 is left alone).

Assertions go through the live handle in `js/main.js`:

- `window.__game.state`, `player` (including `censer`, `pyre`, and `cross`), `enemies`, `projectiles`, `crosses`, `gems`, `input`, `kills`, `time`
- `window.__game.weaponSummary()` for stake stats, censer stats, pyre stats (`owned`, `charges`, `damage`, `radius`, `interval`), cross stats (`owned`, `count`, `damage`, `range`, `interval`), magnet (`radius`, `pickupRadius`, `stacks`), `elite` (`idle`, `warning`, `alive`, `fallen`), and night threat
- `window.__game.input.touch` for the stick (`active`, `visible`, `coarse`, `x`, `y`)
- `window.__game.spawnInterval()` for the opening spawn gap
- `window.__game.toggleMute()` and `audio.muted` for the sound bus
- `window.__game.applyUpgrade(id)` to take a catalog boon without waiting on the roll
- `window.__game.currentChoices` while the boon overlay is open
- `window.__game.sprites.player` for the loaded hunter sheet
- `window.__game.sprites.tileset` and `art.tilesetKind` (`graveyard` or `classic`) for the floor
- `window.__game.sprites.enemies` for the bat, shambler, and brute sheets
- `window.__game.player.facing` for the 8-way direction name (`south`, `east`, `west`, …)

No gameplay numbers are changed in source. Level-up is forced by granting the XP still needed to leave level 1 and queueing `pendingLevels`, which the next frame turns into the normal boon overlay. Game over is forced by setting `player.hp` to 0. The Warden spec writes `time` and `kills` on the live object so the 90s / 80-kill gate opens on the next frame. It also raises HP and the XP target, and later parks the hunter away from the drop, so a death, a level-up pause, or gem pickup cannot cut the telegraph short. Those writes stay in the spec.

## What it covers

| Spec | Check |
| --- | --- |
| loads the menu with no console errors | Page boots, `state === "menu"`, no `pageerror` or console error, stake owned, censer locked, threat 0 |
| starts a run from the menu | **Begin the night** opens select; confirming enters `playing`, HUD shows, four foes are in, XP to leave level 1 is 40, opening spawn interval stays between 1s and 2s |
| holding a direction moves the player | `KeyD` is in `input.down` and the player moves more than 20px |
| the stake auto-attacks | A projectile appears on its own and `weaponSummary().stake` is armed |
| forced level-up offers Warding Censer | The boon overlay includes Censer; choosing it sets `censer.owned` and the HUD chip |
| falling and rising again | HP 0 opens game over; **Rise again** and `R` each start a fresh night |
| forced level-up offers Cinder Pyre | The boon overlay includes Pyre; choosing it sets `weaponSummary().pyre.owned` and the HUD chip to `Pyre ×1` |
| mute flips | `toggleMute()`, **M**, and **Sound on** / **Muted** each flip `audio.muted`, the button label, and `aria-pressed` |
| the warden leaves idle | Below 90s the elite stays `idle` even at 80 kills; at 90s / 80 kills it reaches `warning` then `alive`. Felling the warden sets `fallen` and leaves one 30 XP gem plus six 5 XP gems |
| forced level-up offers Ash Cross | The boon overlay includes Ash Cross; choosing it sets `weaponSummary().cross.owned` and the HUD chip to `Cross ×1`, then a bolt appears |
| Grave Magnet stacks | `applyUpgrade("magnet")` walks 110 → 152 → 194 → 236 → 278 → 320, the HUD reads `Magnet 320`, and a further call is refused. Pickup radius stays 22 |
| v0.5.1 tuning | Caps, batch sizes, stake ×1.2, haste floor 0.25s, bat speed cap, XP salvage, swarms that stack past the cap and pause normal spawns, warden HP on the return, Dawn breaks after a level-up card (even with a living warden), and F3 |
| touch stick | On desktop the stick stays hidden. A mouse pointer does nothing. A touch drag sets `input.touch` and shows `#stick`. Holding **W** replaces that vector |
| player sprite and facing | `sprites.player` is the loaded 448×512 Hunter sheet. Holding **D** sets `player.facing` to `east` and it stays after release. Holding **A** sets `west` and it stays after release |
| character sheets | Each select card's canvas and that hunter's in-game sprite use the same sheet URL (`hunter_sheet` or `stakeman_sheet`). Nothing requests `player_sheet` |
| enemy sheets and graveyard tileset | Bat 68×544, shambler 92×736, and brute 104×832 sheets load, and the floor image is `tileset_graveyard.png` at 128×128 (`tilesetKind === "graveyard"`). A filled crowd still reports FPS on **F3** |
| begin(characterId) | `__begin("hunter")` and `__begin("warden_hunter")` set that body's HP, speed, stake, interval, and pierce. Sharpened Stake, Hasty Ritual, and Fleet Foot scale from that base |
| saved character fallback | `nightfall.character` of `nope`, or a missing key, starts the hunter |
| Enter opens select | **Enter** on the title shows the cards and does not spawn. **Right** then **Enter** starts The Stakeman |
| restart keeps the character | **Rise again** after The Stakeman repeats those stats. **C** on the fallen sheet returns to select and the clock stays put |

## Run

From the repo root, with Node 22 and Python 3:

```bash
npm install
npx playwright install chromium
npm test
```

`npm run test:smoke` is the same command. The first Playwright install downloads Chromium; later runs only start the static server and the specs.

To watch a failure, open the trace Playwright keeps on failure:

```bash
npx playwright show-trace test-results/**/trace.zip
```

## CI

`.github/workflows/smoke.yml` runs the same suite on pull requests and on pushes to `qa/test-scripts`. It installs the pinned `@playwright/test` version from `package.json` and Chromium with system dependencies.
