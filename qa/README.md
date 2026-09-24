# Nightfall smoke suite

Automated smoke checks for the v0.3.0 client. The six specs are the v0.2.0 behaviors; the document title pin is v0.3.0. The specs live in `qa/smoke.spec.js` and drive the real page through Chromium. Playwright starts `python3 -m http.server` on port **8099** (the dev server on 8080 is left alone).

Assertions go through the live handle in `js/main.js`:

- `window.__game.state`, `player`, `enemies`, `projectiles`, `input`, `kills`, `time`
- `window.__game.weaponSummary()` for stake stats, censer stats, and night threat
- `window.__game.spawnInterval()` for the opening spawn gap

No gameplay numbers are changed for these tests. Level-up is forced by granting the XP still needed to leave level 1 and queueing `pendingLevels`, which the next frame turns into the normal boon overlay. Game over is forced by setting `player.hp` to 0.

## What it covers

| Spec | Check |
| --- | --- |
| loads the menu with no console errors | Page boots, `state === "menu"`, no `pageerror` or console error, stake owned, censer locked, threat 0 |
| starts a run from the menu | **Begin the night** enters `playing`, HUD shows, four foes are in, XP to leave level 1 is 40, opening spawn interval stays between 1s and 2s |
| holding a direction moves the player | `KeyD` is in `input.down` and the player moves more than 20px |
| the stake auto-attacks | A projectile appears on its own and `weaponSummary().stake` is armed |
| forced level-up offers Warding Censer | The boon overlay includes Censer; choosing it sets `censer.owned` and the HUD chip |
| falling and rising again | HP 0 opens game over; **Rise again** and `R` each start a fresh night |

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
