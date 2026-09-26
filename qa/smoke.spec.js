import { expect, test } from "@playwright/test";

function trackProblems(page) {
  const problems = [];
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  return problems;
}

async function bootMenu(page) {
  const problems = trackProblems(page);
  await page.goto("/");
  try {
    await page.waitForFunction(() => window.__game && window.__game.state === "menu");
  } catch (error) {
    throw new Error(`${error.message}\n${problems.join("\n")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
  return problems;
}

async function beginNight(page) {
  await page.getByRole("button", { name: "Begin the night" }).click();
  await page.waitForFunction(() => window.__game.state === "select");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__game.state === "playing");
}

test("loads the menu with no console errors", async ({ page }) => {
  await bootMenu(page);
  await expect(page).toHaveTitle(/Nightfall — v0\.7\.0/);
  await expect(page.locator("#overlay-start")).toBeVisible();
  await expect(page.locator("#hud")).toBeHidden();

  const summary = await page.evaluate(() => window.__game.weaponSummary());
  expect(summary.stake.count).toBe(1);
  expect(summary.stake.damage).toBeGreaterThan(0);
  expect(summary.censer.owned).toBe(false);
  expect(summary.cross.owned).toBe(false);
  expect(summary.magnet.radius).toBe(110);
  expect(summary.magnet.pickupRadius).toBe(22);
  expect(summary.magnet.stacks).toBe(0);
  expect(summary.threat).toBe(0);
});

test("starts a run from the menu", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);

  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#overlay-start")).toBeHidden();
  await expect(page.locator("#weapon-censer")).toHaveClass(/locked/);

  const snap = await page.evaluate(() => ({
    hp: window.__game.player.hp,
    level: window.__game.player.level,
    xpToNext: window.__game.player.xpToNext,
    enemies: window.__game.enemies.length,
    interval: window.__game.spawnInterval(),
    weapons: window.__game.weaponSummary(),
  }));
  expect(snap.hp).toBe(100);
  expect(snap.level).toBe(1);
  expect(snap.xpToNext).toBe(40);
  expect(snap.enemies).toBeGreaterThanOrEqual(4);
  expect(snap.interval).toBeGreaterThan(1);
  expect(snap.interval).toBeLessThan(2);
  expect(snap.weapons.stake.count).toBe(1);
  expect(snap.weapons.censer.owned).toBe(false);
});

test("holding a direction moves the player and sets the input flag", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  const origin = await page.evaluate(() => ({
    x: window.__game.player.x,
    y: window.__game.player.y,
  }));

  await page.keyboard.down("d");
  await page.waitForFunction(() => window.__game.input.down.has("KeyD"));
  await page.waitForFunction((start) => {
    const player = window.__game.player;
    return Math.hypot(player.x - start.x, player.y - start.y) > 20;
  }, origin);
  await page.keyboard.up("d");
  await page.waitForFunction(() => !window.__game.input.down.has("KeyD"));

  const moved = await page.evaluate((start) => ({
    x: window.__game.player.x,
    y: window.__game.player.y,
    dx: window.__game.player.x - start.x,
  }), origin);
  expect(moved.dx).toBeGreaterThan(20);
});

test("the stake auto-attacks while foes are on the field", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await page.waitForFunction(() => window.__game.projectiles.length > 0);

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.stake.count).toBeGreaterThanOrEqual(1);
  expect(weapons.stake.damage).toBeGreaterThan(0);
  expect(weapons.stake.interval).toBeGreaterThan(0);
  await expect(page.locator("#weapon-stake")).toHaveText(/Stake ×1/);
});

test("a forced level-up offers Warding Censer and taking it arms the weapon", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);

  const queued = await page.evaluate(() => {
    const game = window.__game;
    const gained = game.player.gainXp(game.player.xpToNext);
    game.pendingLevels += gained.length;
    return { gained, pending: game.pendingLevels, level: game.player.level };
  });
  expect(queued.gained).toEqual([2]);
  expect(queued.pending).toBeGreaterThan(0);

  await page.waitForFunction(() => window.__game.state === "levelup");
  await expect(page.locator("#overlay-level")).toBeVisible();

  const ids = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  expect(ids).toContain("censer");

  await page.locator("#choices button", { hasText: "Lantern" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.censer.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.censer.owned).toBe(true);
  expect(weapons.censer.orbs).toBeGreaterThanOrEqual(1);
  expect(weapons.censer.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-censer")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-censer")).toHaveText(/Lantern ×1/);
});

test("falling and rising again starts a fresh night", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);

  await page.evaluate(() => {
    window.__game.player.hp = 0;
  });
  await page.waitForFunction(() => window.__game.state === "gameover");
  await expect(page.getByRole("heading", { name: "You fell" })).toBeVisible();
  await expect(page.locator("#summary")).toContainText("Weapons");

  await page.getByRole("button", { name: "Rise again" }).click();
  await page.waitForFunction(() => window.__game.state === "playing");
  await expectFreshNight(page);

  await page.evaluate(() => {
    window.__game.player.hp = 0;
  });
  await page.waitForFunction(() => window.__game.state === "gameover");
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__game.state === "playing");
  await expectFreshNight(page);
});

test("a forced level-up offers Cinder Pyre and taking it arms the weapon", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await expect(page.locator("#weapon-pyre")).toHaveClass(/locked/);
  await expect(page.locator("#weapon-pyre")).toHaveText("Holy Water");

  const queued = await page.evaluate(() => {
    const game = window.__game;
    const gained = game.player.gainXp(game.player.xpToNext);
    game.pendingLevels += gained.length;
    return { gained, pending: game.pendingLevels };
  });
  expect(queued.gained).toEqual([2]);
  expect(queued.pending).toBeGreaterThan(0);

  await page.waitForFunction(() => window.__game.state === "levelup");
  await expect(page.locator("#overlay-level")).toBeVisible();

  const ids = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  expect(ids).toContain("pyre");

  await page.locator("#choices button", { hasText: "Holy Water" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.pyre.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.pyre.owned).toBe(true);
  expect(weapons.pyre.charges).toBeGreaterThanOrEqual(1);
  expect(weapons.pyre.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-pyre")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-pyre")).toHaveText(/Holy Water ×1/);
});

test("mute flips from the bus, the M key, and the sound button", async ({ page }) => {
  await bootMenu(page);

  expect(await page.evaluate(() => window.__game.audio.muted)).toBe(false);
  await expect(page.locator("#btn-mute")).toHaveText("Sound on");
  await expect(page.locator("#btn-mute")).toHaveAttribute("aria-pressed", "false");

  await page.evaluate(() => window.__game.toggleMute());
  expect(await page.evaluate(() => window.__game.audio.muted)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("nightfall-muted"))).toBe("1");
  await expect(page.locator("#btn-mute")).toHaveText("Muted");
  await expect(page.locator("#btn-mute")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#btn-mute")).toHaveClass(/is-muted/);

  await page.keyboard.press("m");
  expect(await page.evaluate(() => window.__game.audio.muted)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("nightfall-muted"))).toBe("0");
  await expect(page.locator("#btn-mute")).toHaveText("Sound on");
  await expect(page.locator("#btn-mute")).toHaveAttribute("aria-pressed", "false");

  await page.locator("#btn-mute").click();
  expect(await page.evaluate(() => window.__game.audio.muted)).toBe(true);
  await expect(page.locator("#btn-mute")).toHaveText("Muted");
  await expect(page.locator("#btn-mute")).toHaveAttribute("aria-pressed", "true");
});

test("the warden leaves idle on the 90s kill gate and drops a gem hoard", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  expect(await page.evaluate(() => window.__game.weaponSummary().elite)).toBe("idle");

  await page.evaluate(() => {
    const game = window.__game;
    // Keep the night in "playing" while the telegraph runs. These are harness
    // writes on the live object, same idea as forcing HP for game over.
    game.player.maxHp = 5000;
    game.player.hp = 5000;
    game.player.xpToNext = 1_000_000;
    game.time = 80;
    game.kills = 80;
  });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  expect(await page.evaluate(() => window.__game.weaponSummary().elite)).toBe("idle");
  expect(await page.evaluate(() => window.__game.time)).toBeLessThan(90);

  await page.evaluate(() => {
    window.__game.time = 90;
    window.__game.kills = 80;
  });
  await page.waitForFunction(() => window.__game.weaponSummary().elite === "warning");
  await expect(page.locator("#omen")).toBeVisible();
  await expect(page.locator("#omen")).toHaveText("The Warden rises");

  await page.waitForFunction(() => window.__game.weaponSummary().elite === "alive");
  const warden = await page.evaluate(() => {
    const enemy = window.__game.enemies.find((entry) => entry.type === "warden");
    return enemy ? enemy.hp : 0;
  });
  expect(warden).toBeGreaterThan(0);

  const before = await page.evaluate(() => {
    const game = window.__game;
    const values = game.gems.map((gem) => gem.value);
    for (const enemy of game.enemies) {
      if (enemy.type === "warden") enemy.hp = 0;
      else enemy.hp = Math.max(enemy.hp, 100000);
    }
    // Park the hunter so the hoard is still on the field next frame.
    game.player.x += 4000;
    game.player.y += 4000;
    return values;
  });

  await page.waitForFunction(() => window.__game.weaponSummary().elite === "fallen");
  await expect(page.locator("#omen")).toHaveText("The Warden falls");

  const delta = await page.evaluate((previous) => {
    const tally = (values) => {
      const counts = new Map();
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
      return counts;
    };
    const prior = tally(previous);
    const now = tally(window.__game.gems.map((gem) => gem.value));
    const keys = new Set([...prior.keys(), ...now.keys()]);
    const diff = {};
    for (const key of keys) {
      const change = (now.get(key) || 0) - (prior.get(key) || 0);
      if (change !== 0) diff[key] = change;
    }
    return diff;
  }, before);
  expect(delta[30]).toBe(1);
  expect(delta[5]).toBe(6);
});

test("a forced level-up offers Ash Cross and taking it arms the weapon", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await expect(page.locator("#weapon-cross")).toHaveClass(/locked/);
  await expect(page.locator("#weapon-cross")).toHaveText("Cross Boomerang");

  const queued = await page.evaluate(() => {
    const game = window.__game;
    const gained = game.player.gainXp(game.player.xpToNext);
    game.pendingLevels += gained.length;
    return { gained, pending: game.pendingLevels };
  });
  expect(queued.gained).toEqual([2]);
  expect(queued.pending).toBeGreaterThan(0);

  await page.waitForFunction(() => window.__game.state === "levelup");
  await expect(page.locator("#overlay-level")).toBeVisible();

  const ids = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  expect(ids).toContain("cross");

  await page.locator("#choices button", { hasText: "Cross Boomerang" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.cross.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.cross.owned).toBe(true);
  expect(weapons.cross.count).toBeGreaterThanOrEqual(1);
  expect(weapons.cross.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-cross")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-cross")).toHaveText(/Cross Boomerang ×1/);

  await page.waitForFunction(() => window.__game.crosses.length > 0);
});

test("Grave Magnet stacks the pull radius and the HUD follows", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await expect(page.locator("#magnet")).toHaveText("Magnet 110");
  await expect(page.locator("#magnet")).not.toHaveClass(/armed/);

  const steps = await page.evaluate(() => {
    const game = window.__game;
    const radii = [game.weaponSummary().magnet.radius];
    while (game.applyUpgrade("magnet")) radii.push(game.weaponSummary().magnet.radius);
    return {
      radii,
      stacks: game.weaponSummary().magnet.stacks,
      pickup: game.weaponSummary().magnet.pickupRadius,
      refused: game.applyUpgrade("magnet"),
    };
  });
  expect(steps.radii).toEqual([110, 152, 194, 236, 278, 320]);
  expect(steps.stacks).toBe(5);
  expect(steps.pickup).toBe(22);
  expect(steps.refused).toBe(false);

  await expect(page.locator("#magnet")).toHaveText("Magnet 320");
  await expect(page.locator("#magnet")).toHaveClass(/armed/);
});

test("the touch stick stays hidden for a mouse until a touch drags it", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await expect(page.locator("#stick")).toHaveClass(/hidden/);

  const idle = await page.evaluate(() => ({ ...window.__game.input.touch }));
  expect(idle.visible).toBe(false);
  expect(idle.coarse).toBe(false);
  expect(idle.active).toBe(false);
  expect(idle.x).toBe(0);
  expect(idle.y).toBe(0);

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 3,
      pointerType: "mouse",
      clientX: 90,
      clientY: 420,
      isPrimary: true,
    }));
  });
  expect(await page.evaluate(() => window.__game.input.touch.active)).toBe(false);

  await page.evaluate(() => {
    const common = {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
    };
    window.dispatchEvent(new PointerEvent("pointerdown", { ...common, clientX: 90, clientY: 400 }));
    window.dispatchEvent(new PointerEvent("pointermove", { ...common, clientX: 150, clientY: 400 }));
  });

  const dragged = await page.evaluate(() => ({ ...window.__game.input.touch }));
  expect(dragged.active).toBe(true);
  expect(dragged.visible).toBe(true);
  expect(dragged.x).toBeGreaterThan(0.45);
  expect(Math.abs(dragged.y)).toBeLessThan(0.2);
  await expect(page.locator("#stick")).not.toHaveClass(/hidden/);

  await page.keyboard.down("w");
  const axis = await page.evaluate(() => window.__game.input.axis());
  expect(axis.y).toBeLessThan(-0.5);
  expect(Math.abs(axis.x)).toBeLessThan(0.2);
  await page.keyboard.up("w");

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: "touch",
      clientX: 150,
      clientY: 400,
      isPrimary: true,
    }));
  });
  const released = await page.evaluate(() => ({ ...window.__game.input.touch }));
  expect(released.active).toBe(false);
  expect(released.visible).toBe(false);
  expect(released.x).toBe(0);
  expect(released.y).toBe(0);
  await expect(page.locator("#stick")).toHaveClass(/hidden/);
});

test("the player sprite loads and facing follows left and right", async ({ page }) => {
  await bootMenu(page);
  const sheet = await page.evaluate(() => {
    const image = window.__game.sprites.player;
    return {
      loaded: Boolean(image && image.complete && image.naturalWidth > 0),
      width: image ? image.naturalWidth : 0,
      height: image ? image.naturalHeight : 0,
    };
  });
  expect(sheet.loaded).toBe(true);
  expect(sheet.width).toBe(476);
  expect(sheet.height).toBe(544);

  await beginNight(page);
  await page.keyboard.down("d");
  await page.waitForFunction(() => window.__game.player.facing === "east");
  await page.keyboard.up("d");
  await page.waitForFunction(() => !window.__game.input.down.has("KeyD"));
  expect(await page.evaluate(() => window.__game.player.facing)).toBe("east");

  await page.keyboard.down("a");
  await page.waitForFunction(() => window.__game.player.facing === "west");
  await page.keyboard.up("a");
  await page.waitForFunction(() => !window.__game.input.down.has("KeyA"));
  expect(await page.evaluate(() => window.__game.player.facing)).toBe("west");
});

test("enemy sheets and the graveyard tileset load", async ({ page }) => {
  await bootMenu(page);
  const art = await page.evaluate(() => {
    const game = window.__game;
    const size = (image) => (image && image.complete && image.naturalWidth > 0
      ? { width: image.naturalWidth, height: image.naturalHeight, src: image.currentSrc || image.src }
      : null);
    return {
      kind: game.art?.tilesetKind || null,
      tileset: size(game.sprites.tileset),
      bat: size(game.sprites.enemies?.bat),
      shambler: size(game.sprites.enemies?.shambler),
      brute: size(game.sprites.enemies?.brute),
    };
  });
  expect(art.kind).toBe("graveyard");
  expect(art.tileset?.src || "").toContain("tileset_graveyard.png");
  expect(art.tileset.width).toBe(128);
  expect(art.tileset.height).toBe(128);
  expect(art.bat.width).toBe(68);
  expect(art.bat.height).toBe(544);
  expect(art.bat.src).toContain("bat_sheet.png");
  expect(art.shambler.width).toBe(92);
  expect(art.shambler.height).toBe(736);
  expect(art.shambler.src).toContain("shambler_sheet.png");
  expect(art.brute.width).toBe(104);
  expect(art.brute.height).toBe(832);
  expect(art.brute.src).toContain("brute_sheet.png");

  await beginNight(page);
  const crowd = await page.evaluate(() => {
    const game = window.__game;
    game.player.hp = 100000;
    game.player.maxHp = 100000;
    game.spawnTimer = 999;
    const target = 220;
    while (game.enemies.length < target) {
      const left = target - game.enemies.length;
      game.spawnEdgeLine("bat", Math.min(30, left));
      if (game.enemies.length < target) game.spawnRing("brute", Math.min(12, target - game.enemies.length));
      if (game.enemies.length < target) game.spawnMixed(Math.min(40, target - game.enemies.length));
    }
    return game.enemies.length;
  });
  expect(crowd).toBeGreaterThanOrEqual(220);

  await page.keyboard.press("F3");
  await page.waitForFunction(() => window.__game.showPerf && window.__game.fps > 0);
  const perf = await page.evaluate(() => ({
    fps: window.__game.fps,
    enemies: window.__game.enemies.length,
    text: document.getElementById("perf").textContent,
  }));
  expect(perf.enemies).toBeGreaterThanOrEqual(180);
  expect(perf.text).toContain("FPS");
  expect(perf.text).toContain("Enemies");
  expect(perf.fps).toBeGreaterThan(20);
  console.log(`F3 full crowd: ${perf.text} (raw ${perf.fps.toFixed(1)})`);
});

async function expectFreshNight(page) {
  const snap = await page.evaluate(() => {
    const game = window.__game;
    return {
      hp: game.player.hp,
      level: game.player.level,
      xp: game.player.xp,
      kills: game.kills,
      time: game.time,
      owned: game.weaponSummary().censer.owned,
      pyre: game.weaponSummary().pyre.owned,
      cross: game.weaponSummary().cross.owned,
      magnet: game.weaponSummary().magnet.radius,
      stacks: game.weaponSummary().magnet.stacks,
      stake: game.weaponSummary().stake.count,
    };
  });
  expect(snap.hp).toBe(100);
  expect(snap.level).toBe(1);
  expect(snap.xp).toBe(0);
  expect(snap.kills).toBe(0);
  expect(snap.time).toBeLessThan(1);
  expect(snap.owned).toBe(false);
  expect(snap.pyre).toBe(false);
  expect(snap.cross).toBe(false);
  expect(snap.magnet).toBe(110);
  expect(snap.stacks).toBe(0);
  expect(snap.stake).toBe(1);
}

test("v0.5.1 tuning, swarms, warden return, dawn, and the perf overlay", async ({ page }) => {
  const problems = await bootMenu(page);
  await expect(page.locator(".version")).toHaveText("v0.7.0");
  await expect(page.locator("#perf")).toBeHidden();

  await page.keyboard.press("F3");
  await expect(page.locator("#perf")).toBeVisible();
  await expect(page.locator("#perf")).toContainText(/FPS \d+/);
  await expect(page.locator("#perf")).toContainText("Enemies 0");
  await page.keyboard.press("F3");
  await expect(page.locator("#perf")).toBeHidden();

  await beginNight(page);
  await page.evaluate(() => {
    window.__game.state = "levelup";
  });

  const tuning = await page.evaluate(() => {
    const game = window.__game;
    const scale = (time) => 1 + Math.max(0, time - 30) / 220;
    const wardenHp = (time, generation) => Math.round(280 * scale(time) * (1.5 ** generation));

    const damageBefore = game.player.damage;
    game.applyUpgrade("damage");
    const damageAfter = game.player.damage;
    while (game.applyUpgrade("haste")) { /* walk the floor */ }
    const interval = game.player.attackInterval;

    game.kills = 0;
    game.time = 239;
    const capEarly = game.maxEnemies();
    game.enemies = [];
    game.spawnBatch();
    const batchEarly = game.enemies.length;

    game.time = 240;
    const capFour = game.maxEnemies();
    game.enemies = [];
    game.spawnBatch();
    const batchFour = game.enemies.length;

    game.time = 360;
    const capSix = game.maxEnemies();
    game.enemies = [];
    game.spawnBatch();
    const batchSix = game.enemies.length;

    game.enemies = [];
    game.time = 0;
    game.spawnAround("bat");
    const earlyBat = game.enemies[0].speed;
    game.enemies = [];
    game.time = 400;
    game.spawnAround("bat");
    const lateBat = game.enemies[0].speed;

    game.gems = [];
    game.enemies = [];
    game.time = 10;
    game.spawnAround("shambler");
    const droppedXp = game.enemies[0].xp;
    game.cullOneForCap();
    const dropped = game.gems.length === 1 && game.gems[0].value === droppedXp && game.enemies.length === 0;

    game.spawnAround("shambler");
    game.spawnAround("brute");
    const sham = game.enemies.find((enemy) => enemy.type === "shambler");
    const brute = game.enemies.find((enemy) => enemy.type === "brute");
    sham.x = game.player.x + 12;
    sham.y = game.player.y;
    brute.x = game.player.x + 900;
    brute.y = game.player.y;
    const gem = game.gems[0];
    const mergedFrom = gem.value;
    const bruteXp = brute.xp;
    game.cullOneForCap();
    const merged = gem.value === mergedFrom + bruteXp
      && game.enemies.length === 1
      && game.enemies[0].type === "shambler";

    game.gems = [];
    game.enemies = [];
    game.swarmsSeen = new Set();
    game.time = 240;
    game.kills = 0;
    const cap = game.maxEnemies();
    for (let i = 0; i < cap; i += 1) game.spawnAround("shambler");
    game.maybeSwarm();
    const bats = game.enemies.filter((enemy) => enemy.swarm && enemy.type === "bat");
    const batYs = new Set(bats.map((enemy) => enemy.y));
    const batXs = new Set(bats.map((enemy) => enemy.x));
    const salvaged = game.gems.reduce((sum, item) => sum + item.value, 0);
    const afterBats = game.enemies.length;
    const shamblersLeft = game.enemies.filter((enemy) => enemy.type === "shambler" && !enemy.swarm).length;
    const beforePause = game.enemies.length;
    game.spawnBatch();
    const paused = game.enemies.length === beforePause;

    game.time = 360;
    game.maybeSwarm();
    const ring = game.enemies.filter((enemy) => enemy.swarm && enemy.type === "brute");
    const ringDists = ring.map((enemy) => Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y));

    const swarmBeforeMix = game.enemies.filter((enemy) => enemy.swarm).length;
    game.time = 480;
    game.maybeSwarm();
    const swarmAfterMix = game.enemies.filter((enemy) => enemy.swarm).length;
    game.maybeSwarm();
    const swarmAgain = game.enemies.filter((enemy) => enemy.swarm).length;

    game.enemies = game.enemies.filter((enemy) => enemy.type !== "warden");
    game.eliteState = "idle";
    game.eliteWarning = null;
    game.wardenAppearances = 0;
    game.time = 100;
    game.kills = 0;
    game.maybeElite();
    const firstWarned = game.eliteState === "warning";
    game.eliteWarning.time = game.eliteWarning.duration;
    game.spawnWarden();
    const firstHp = game.enemies.find((enemy) => enemy.type === "warden").maxHp;
    game.enemies = game.enemies.filter((enemy) => enemy.type !== "warden");
    game.eliteState = "fallen";
    game.time = 219;
    game.maybeElite();
    const held = game.eliteState;
    game.time = 220;
    game.maybeElite();
    const secondWarned = game.eliteState === "warning";
    game.eliteWarning.time = game.eliteWarning.duration;
    game.spawnWarden();
    const secondHp = game.enemies.find((enemy) => enemy.type === "warden").maxHp;
    game.enemies = game.enemies.filter((enemy) => enemy.type !== "warden");
    game.eliteState = "fallen";
    game.time = 340;
    game.maybeElite();
    game.eliteWarning.time = game.eliteWarning.duration;
    game.spawnWarden();
    const thirdHp = game.enemies.find((enemy) => enemy.type === "warden").maxHp;

    return {
      damageBefore,
      damageAfter,
      interval,
      capEarly,
      capFour,
      capSix,
      batchEarly,
      batchFour,
      batchSix,
      earlyBat,
      lateBat,
      dropped,
      merged,
      batCount: bats.length,
      oneEdge: batYs.size === 1 || batXs.size === 1,
      salvaged,
      afterBats,
      shamblersLeft,
      paused,
      cap,
      ringCount: ring.length,
      ringTight: ringDists.length > 0 && Math.max(...ringDists) - Math.min(...ringDists) < 1,
      swarmBeforeMix,
      swarmAfterMix,
      swarmAgain,
      firstWarned,
      firstHp,
      held,
      secondWarned,
      secondHp,
      thirdHp,
      expectFirst: wardenHp(100, 0),
      expectSecond: wardenHp(220, 1),
      expectThird: wardenHp(340, 2),
    };
  });

  expect(tuning.damageBefore).toBe(12);
  expect(tuning.damageAfter).toBe(14);
  expect(tuning.interval).toBe(0.25);
  expect(tuning.capEarly).toBe(140);
  expect(tuning.capFour).toBe(180);
  expect(tuning.capSix).toBe(220);
  expect(tuning.batchEarly).toBe(5);
  expect(tuning.batchFour).toBe(6);
  expect(tuning.batchSix).toBe(7);
  expect(tuning.earlyBat).toBe(196);
  expect(tuning.lateBat).toBe(200);
  expect(tuning.dropped).toBe(true);
  expect(tuning.merged).toBe(true);
  expect(tuning.batCount).toBe(30);
  expect(tuning.oneEdge).toBe(true);
  expect(tuning.salvaged).toBe(0);
  expect(tuning.afterBats).toBe(tuning.cap + 30);
  expect(tuning.shamblersLeft).toBe(tuning.cap);
  expect(tuning.paused).toBe(true);
  expect(tuning.ringCount).toBe(12);
  expect(tuning.ringTight).toBe(true);
  expect(tuning.swarmAfterMix - tuning.swarmBeforeMix).toBe(40);
  expect(tuning.swarmAgain).toBe(tuning.swarmAfterMix);
  expect(tuning.firstWarned).toBe(true);
  expect(tuning.held).toBe("fallen");
  expect(tuning.secondWarned).toBe(true);
  expect(tuning.firstHp).toBe(tuning.expectFirst);
  expect(tuning.secondHp).toBe(tuning.expectSecond);
  expect(tuning.thirdHp).toBe(tuning.expectThird);

  await page.evaluate(() => {
    const game = window.__game;
    for (const enemy of game.enemies) enemy.hp = 1e9;
    game.projectiles = [];
    game.pools = [];
    game.flasks = [];
    game.crosses = [];
    game.gems = [];
    game.player.attackTimer = 10;
    game.player.invuln = 10;
    game.player.hp = 80;
    game.kills = 7;
    game.player.level = 4;
    game.pendingLevels = 1;
    game.time = 600;
    game.eliteState = "alive";
    game.state = "playing";
  });

  await page.waitForFunction(() => window.__game.state === "levelup");
  await expect(page.locator("#overlay-win")).toBeHidden();
  expect(await page.evaluate(() => {
    const warden = window.__game.enemies.find((enemy) => enemy.type === "warden");
    return warden ? warden.hp : 0;
  })).toBeGreaterThan(0);

  await page.locator("#choices button").first().click();
  await page.waitForFunction(() => window.__game.state === "victory");
  expect(await page.evaluate(() => {
    const warden = window.__game.enemies.find((enemy) => enemy.type === "warden");
    return warden ? warden.hp : 0;
  })).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Dawn breaks" })).toBeVisible();
  await expect(page.locator("#overlay-win")).toBeVisible();
  await expect(page.locator("#hud")).toBeHidden();
  const rows = await page.locator("#win-summary dd").allTextContents();
  expect(rows).toEqual(["10:00", "7", "4"]);

  const frozen = await page.evaluate(() => {
    const enemy = window.__game.enemies[0];
    return {
      time: window.__game.time,
      x: enemy ? enemy.x : null,
      y: enemy ? enemy.y : null,
    };
  });
  await page.waitForTimeout(250);
  const later = await page.evaluate(() => {
    const enemy = window.__game.enemies[0];
    return {
      time: window.__game.time,
      x: enemy ? enemy.x : null,
      y: enemy ? enemy.y : null,
    };
  });
  expect(later).toEqual(frozen);

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__game.state === "playing");
  await expectFreshNight(page);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("begin(characterId) applies each hunter, and boons scale from that base", async ({ page }) => {
  await bootMenu(page);

  const hunter = await page.evaluate(() => {
    window.__begin("hunter");
    const game = window.__game;
    const base = {
      id: game.player.characterId,
      hp: game.player.maxHp,
      speed: game.player.speed,
      damage: game.player.damage,
      interval: game.player.attackInterval,
      pierce: game.player.pierce,
    };
    game.applyUpgrade("damage");
    game.applyUpgrade("haste");
    game.applyUpgrade("speed");
    return {
      base,
      damage: game.player.damage,
      interval: game.player.attackInterval,
      speed: game.player.speed,
    };
  });
  expect(hunter.base).toEqual({
    id: "hunter",
    hp: 100,
    speed: 168,
    damage: 12,
    interval: 0.56,
    pierce: 0,
  });
  expect(hunter.damage).toBe(Math.round(12 * 1.2));
  expect(hunter.interval).toBeCloseTo(Math.max(0.25, 0.56 * 0.88), 5);
  expect(hunter.speed).toBe(Math.min(400, Math.round(168 * 1.1)));

  const stakeman = await page.evaluate(() => {
    window.__begin("warden_hunter");
    const game = window.__game;
    const base = {
      id: game.player.characterId,
      hp: game.player.maxHp,
      speed: game.player.speed,
      damage: game.player.damage,
      interval: game.player.attackInterval,
      pierce: game.player.pierce,
      state: game.state,
      stored: localStorage.getItem("nightfall.character"),
    };
    game.applyUpgrade("damage");
    game.applyUpgrade("haste");
    game.applyUpgrade("speed");
    game.applyUpgrade("pierce");
    const sheet = game.art.characters.warden_hunter;
    return {
      base,
      damage: game.player.damage,
      interval: game.player.attackInterval,
      speed: game.player.speed,
      pierce: game.player.pierce,
      art: {
        ready: Boolean(sheet && sheet.image),
        fallback: Boolean(sheet && sheet.fallback),
        frameWidth: sheet ? sheet.frameWidth : 0,
        walkFrames: sheet ? sheet.walkFrames : 0,
      },
    };
  });
  expect(stakeman.base).toEqual({
    id: "warden_hunter",
    hp: 130,
    speed: 150,
    damage: 16,
    interval: 0.68,
    pierce: 1,
    state: "playing",
    stored: "warden_hunter",
  });
  expect(stakeman.damage).toBe(Math.round(16 * 1.2));
  expect(stakeman.interval).toBeCloseTo(Math.max(0.25, 0.68 * 0.88), 5);
  expect(stakeman.speed).toBe(Math.min(400, Math.round(150 * 1.1)));
  expect(stakeman.pierce).toBe(2);
  expect(stakeman.art.ready).toBe(true);
  if (stakeman.art.fallback) {
    expect(stakeman.art.frameWidth).toBe(68);
  } else {
    expect(stakeman.art.frameWidth).toBe(80);
    expect(stakeman.art.walkFrames).toBe(6);
  }
});

test("a missing or invalid saved character falls back to the hunter", async ({ page }) => {
  await bootMenu(page);
  await page.evaluate(() => localStorage.setItem("nightfall.character", "nope"));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === "menu");
  await page.evaluate(() => window.__begin());
  await page.waitForFunction(() => window.__game.state === "playing");
  expect(await page.evaluate(() => window.__game.player.characterId)).toBe("hunter");
  expect(await page.evaluate(() => localStorage.getItem("nightfall.character"))).toBe("hunter");

  await page.evaluate(() => localStorage.removeItem("nightfall.character"));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.state === "menu");
  await page.evaluate(() => window.__begin());
  await page.waitForFunction(() => window.__game.state === "playing");
  expect(await page.evaluate(() => ({
    id: window.__game.player.characterId,
    hp: window.__game.player.maxHp,
    stored: localStorage.getItem("nightfall.character"),
  }))).toEqual({ id: "hunter", hp: 100, stored: "hunter" });
});

test("Enter on the title opens character select and does not start a run", async ({ page }) => {
  await bootMenu(page);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__game.state === "select");
  await expect(page.locator("#overlay-select")).toBeVisible();
  await expect(page.locator("#overlay-start")).toBeHidden();
  await expect(page.locator("#hud")).toBeHidden();
  await expect(page.locator(".char-card.selected")).toHaveAttribute("data-character", "hunter");
  await expect(page.locator('[data-character="warden_hunter"] .char-tag')).toHaveText("Pierce 1");
  await expect(page.locator('[data-character="hunter"] .char-tag')).toHaveText("");

  const bars = await page.evaluate(() => {
    const widths = (id) => [...document.querySelectorAll(`[data-character="${id}"] .stat-fill`)]
      .map((el) => el.style.width);
    const labeled = [...document.querySelectorAll(".stat-fill")].some((el) => /\d/.test(el.textContent));
    return { hunter: widths("hunter"), stakeman: widths("warden_hunter"), labeled };
  });
  expect(bars.labeled).toBe(false);
  expect(bars.hunter).toEqual(["77%", "100%", "75%", "100%"]);
  expect(bars.stakeman).toEqual(["100%", "89%", "100%", "82%"]);

  const before = await page.evaluate(() => ({
    time: window.__game.time,
    enemies: window.__game.enemies.length,
  }));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    state: window.__game.state,
    time: window.__game.time,
    enemies: window.__game.enemies.length,
  }));
  expect(after.state).toBe("select");
  expect(after.time).toBe(before.time);
  expect(after.enemies).toBe(0);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".char-card.selected")).toHaveAttribute("data-character", "warden_hunter");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__game.state === "playing");
  expect(await page.evaluate(() => window.__game.player.characterId)).toBe("warden_hunter");
});

test("Rise again keeps the last character, and C returns to select", async ({ page }) => {
  await bootMenu(page);
  await page.evaluate(() => window.__begin("warden_hunter"));
  await page.waitForFunction(() => window.__game.state === "playing");

  await page.evaluate(() => {
    window.__game.player.hp = 0;
  });
  await page.waitForFunction(() => window.__game.state === "gameover");
  await page.getByRole("button", { name: "Rise again" }).click();
  await page.waitForFunction(() => window.__game.state === "playing");
  expect(await page.evaluate(() => ({
    id: window.__game.player.characterId,
    hp: window.__game.player.maxHp,
    damage: window.__game.player.damage,
    pierce: window.__game.player.pierce,
    stored: localStorage.getItem("nightfall.character"),
  }))).toEqual({
    id: "warden_hunter",
    hp: 130,
    damage: 16,
    pierce: 1,
    stored: "warden_hunter",
  });

  await page.evaluate(() => {
    window.__game.player.hp = 0;
  });
  await page.waitForFunction(() => window.__game.state === "gameover");
  await page.keyboard.press("c");
  await page.waitForFunction(() => window.__game.state === "select");
  await expect(page.locator("#overlay-select")).toBeVisible();
  const parked = await page.evaluate(() => window.__game.time);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => ({
    state: window.__game.state,
    time: window.__game.time,
  }))).toEqual({ state: "select", time: parked });
});

test("each hunter's starter is equipped and the other one never is", async ({ page }) => {
  await bootMenu(page);

  const hunter = await page.evaluate(() => {
    window.__begin("hunter");
    const game = window.__game;
    const summary = game.weaponSummary();
    return {
      id: game.player.characterId,
      weaponId: game.player.weaponId,
      hp: game.player.maxHp,
      speed: game.player.speed,
      stake: summary.stake,
      crossbow: summary.crossbow,
      offers: game.availableOffers(),
    };
  });
  expect(hunter.id).toBe("hunter");
  expect(hunter.weaponId).toBe("stake");
  expect(hunter.hp).toBe(100);
  expect(hunter.speed).toBe(168);
  expect(hunter.stake).toMatchObject({ owned: true, damage: 12, interval: 0.56, pierce: 0, speed: 520, count: 1 });
  expect(hunter.crossbow.owned).toBe(false);
  expect(hunter.offers).not.toContain("crossbow");
  expect(hunter.offers).not.toContain("stake");

  const stakeman = await page.evaluate(() => {
    window.__begin("warden_hunter");
    const game = window.__game;
    const summary = game.weaponSummary();
    return {
      id: game.player.characterId,
      weaponId: game.player.weaponId,
      hp: game.player.maxHp,
      speed: game.player.speed,
      stake: summary.stake,
      crossbow: summary.crossbow,
      offers: game.availableOffers(),
    };
  });
  expect(stakeman.id).toBe("warden_hunter");
  expect(stakeman.weaponId).toBe("crossbow");
  expect(stakeman.hp).toBe(130);
  expect(stakeman.speed).toBe(150);
  expect(stakeman.crossbow).toMatchObject({
    owned: true,
    damage: 16,
    interval: 0.68,
    pierce: 1,
    speed: 600,
    count: 1,
  });
  expect(stakeman.stake.owned).toBe(false);
  expect(stakeman.offers).not.toContain("stake");
  expect(stakeman.offers).not.toContain("crossbow");
});

test("five weapons stop further unlock cards", async ({ page }) => {
  await bootMenu(page);
  const armed = await page.evaluate(() => {
    window.__begin("hunter");
    const game = window.__game;
    game.player.hp = 5000;
    game.player.maxHp = 5000;
    game.player.invuln = 30;
    const took = ["censer", "pyre", "cross", "dagger"].map((id) => game.applyUpgrade(id));
    const blocked = ["whip", "scythe", "torch", "tome"].map((id) => game.applyUpgrade(id));
    game.player.xpToNext = 1e12;
    game.pendingLevels = 1;
    return {
      took,
      blocked,
      owned: game.weaponSummary().ownedCount,
      cap: game.weaponSummary().weaponCap,
    };
  });
  expect(armed.took).toEqual([true, true, true, true]);
  expect(armed.blocked).toEqual([false, false, false, false]);
  expect(armed.owned).toBe(5);
  expect(armed.cap).toBe(5);

  await page.waitForFunction(() => window.__game.state === "levelup");
  const ids = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  const unlocks = ["censer", "pyre", "cross", "dagger", "whip", "scythe", "torch", "tome"];
  expect(ids.length).toBeGreaterThanOrEqual(1);
  expect(ids.length).toBeLessThanOrEqual(3);
  expect(ids.filter((id) => unlocks.includes(id))).toEqual([]);
});

test("a dry upgrade pool still shows fallback cards and resumes", async ({ page }) => {
  await bootMenu(page);
  const offers = await page.evaluate(() => {
    window.__begin("hunter");
    const game = window.__game;
    game.player.hp = 1e7;
    game.player.maxHp = 1e7;
    game.player.invuln = 1e7;
    game.player.xpToNext = 1e12;
    const ids = game.upgradeIds();
    let guard = 0;
    let progressed = true;
    while (progressed && guard < 40) {
      progressed = false;
      for (const id of ids) {
        if (game.applyUpgrade(id)) progressed = true;
      }
      guard += 1;
    }
    game.pendingLevels = 1;
    return { offers: game.availableOffers(), guard };
  });
  expect(offers.offers).toEqual([]);

  await page.waitForFunction(() => window.__game.state === "levelup");
  const first = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  expect(first.length).toBeGreaterThanOrEqual(1);
  expect(first.length).toBeLessThanOrEqual(3);
  expect(first.some((id) => id === "bloodDraught" || id === "darkPact")).toBe(true);
  await page.locator("#choices button").first().click();
  await page.waitForFunction(() => window.__game.state === "playing");

  await page.evaluate(() => {
    const game = window.__game;
    for (let i = 0; i < 12; i += 1) game.applyUpgrade("darkPact");
    game.pendingLevels = 1;
  });
  await page.waitForFunction(() => window.__game.state === "levelup");
  const second = await page.evaluate(() => window.__game.currentChoices.map((choice) => choice.id));
  expect(second.length).toBeGreaterThanOrEqual(1);
  expect(second.length).toBeLessThanOrEqual(3);
  expect(second).toContain("bloodDraught");
  expect(second).not.toContain("darkPact");
  await page.keyboard.press("1");
  await page.waitForFunction(() => window.__game.state === "playing");
});

test("all twelve card icons load", async ({ page }) => {
  await bootMenu(page);
  const icons = await page.evaluate(() => window.__game.iconStatus());
  expect(icons.map((icon) => icon.id).sort()).toEqual([
    "bloodDraught",
    "censer",
    "cross",
    "crossbow",
    "dagger",
    "darkPact",
    "pyre",
    "scythe",
    "stake",
    "tome",
    "torch",
    "whip",
  ]);
  for (const icon of icons) {
    expect(icon.ok, icon.id).toBe(true);
    expect(icon.width, icon.id).toBe(64);
    expect(icon.height, icon.id).toBe(64);
  }
});

test("torch, holy water, and scythe at max stay inside the FX caps at 220 foes", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await page.evaluate(() => {
    const game = window.__game;
    const max = (id) => {
      while (game.applyUpgrade(id)) { /* climb the track */ }
    };
    game.applyUpgrade("torch");
    max("torch-heat");
    max("torch-reach");
    game.applyUpgrade("pyre");
    max("pyre-charges");
    max("pyre-heat");
    max("pyre-reach");
    game.applyUpgrade("scythe");
    max("scythe-heat");
    max("scythe-reach");
    max("scythe-haste");
    game.player.hp = 1e9;
    game.player.maxHp = 1e9;
    game.player.invuln = 1e9;
    game.player.xpToNext = 1e12;
    game.spawnTimer = 999;
    const target = 220;
    while (game.enemies.length < target) {
      const left = target - game.enemies.length;
      game.spawnEdgeLine("bat", Math.min(30, left));
      if (game.enemies.length < target) game.spawnRing("shambler", Math.min(12, target - game.enemies.length));
      if (game.enemies.length < target) game.spawnMixed(Math.min(40, target - game.enemies.length));
    }
    const list = game.enemies;
    for (let i = 0; i < list.length; i += 1) {
      const ring = i < 90 ? 36 + (i % 8) * 14 : 190 + (i % 12) * 22;
      const angle = i * 2.399963;
      list[i].x = game.player.x + Math.cos(angle) * ring;
      list[i].y = game.player.y + Math.sin(angle) * ring;
      list[i].hp = 1e9;
      list[i].xp = 0;
    }
    game.player.torch.timer = 0;
    game.player.scythe.timer = 0;
    game.player.pyre.timer = 0;
    game.player.attackTimer = 10;
  });

  await page.evaluate(() => {
    window.__fxPeak = { particles: 0, numbers: 0, voices: 0 };
    const mark = () => {
      const stats = window.__game.fxStats();
      const peak = window.__fxPeak;
      peak.particles = Math.max(peak.particles, stats.particles);
      peak.numbers = Math.max(peak.numbers, stats.numbers);
      peak.voices = Math.max(peak.voices, stats.voices);
      if (window.__fxWatch) requestAnimationFrame(mark);
    };
    window.__fxWatch = true;
    requestAnimationFrame(mark);
  });
  await page.keyboard.press("F3");
  await page.waitForTimeout(1800);
  const perf = await page.evaluate(() => {
    window.__fxWatch = false;
    return {
      fps: window.__game.fps,
      enemies: window.__game.enemies.length,
      text: document.getElementById("perf").textContent,
      weapons: window.__game.weaponSummary(),
      peak: window.__fxPeak,
    };
  });
  expect(perf.weapons.torch.damage).toBe(9);
  expect(perf.weapons.torch.radius).toBe(110);
  expect(perf.weapons.scythe.damage).toBe(40);
  expect(perf.weapons.scythe.radius).toBe(160);
  expect(perf.weapons.scythe.interval).toBeLessThanOrEqual(1.6 + 1e-6);
  expect(perf.weapons.pyre.charges).toBe(3);
  expect(perf.enemies).toBeGreaterThanOrEqual(180);
  expect(perf.text).toContain("FPS");
  expect(perf.text).toContain("Particles");
  expect(perf.text).toContain("Numbers");
  expect(perf.peak.particles).toBeGreaterThan(0);
  expect(perf.peak.particles).toBeLessThanOrEqual(300);
  expect(perf.peak.numbers).toBeLessThanOrEqual(40);
  expect(perf.peak.voices).toBeLessThanOrEqual(6);
  expect(perf.fps).toBeGreaterThan(55);
  console.log(`F3 area weapons: ${perf.text} (raw ${perf.fps.toFixed(1)}, enemies ${perf.enemies}, peak p${perf.peak.particles} n${perf.peak.numbers} v${perf.peak.voices})`);
});
