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
  await page.waitForFunction(() => window.__game.state === "playing");
}

test("loads the menu with no console errors", async ({ page }) => {
  await bootMenu(page);
  await expect(page).toHaveTitle(/Nightfall — v0\.4\.0/);
  await expect(page.locator("#overlay-start")).toBeVisible();
  await expect(page.locator("#hud")).toBeHidden();

  const summary = await page.evaluate(() => window.__game.weaponSummary());
  expect(summary.stake.count).toBe(1);
  expect(summary.stake.damage).toBeGreaterThan(0);
  expect(summary.censer.owned).toBe(false);
  expect(summary.cross.owned).toBe(false);
  expect(summary.magnet.radius).toBe(175);
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

  await page.locator("#choices button", { hasText: "Warding Censer" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.censer.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.censer.owned).toBe(true);
  expect(weapons.censer.orbs).toBeGreaterThanOrEqual(1);
  expect(weapons.censer.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-censer")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-censer")).toHaveText(/Censer ×1/);
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
  await expect(page.locator("#weapon-pyre")).toHaveText("Pyre");

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

  await page.locator("#choices button", { hasText: "Cinder Pyre" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.pyre.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.pyre.owned).toBe(true);
  expect(weapons.pyre.charges).toBeGreaterThanOrEqual(1);
  expect(weapons.pyre.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-pyre")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-pyre")).toHaveText(/Pyre ×1/);
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
  await expect(page.locator("#weapon-cross")).toHaveText("Cross");

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

  await page.locator("#choices button", { hasText: "Ash Cross" }).click();
  await page.waitForFunction(() => (
    window.__game.state === "playing" && window.__game.player.cross.owned
  ));

  const weapons = await page.evaluate(() => window.__game.weaponSummary());
  expect(weapons.cross.owned).toBe(true);
  expect(weapons.cross.count).toBeGreaterThanOrEqual(1);
  expect(weapons.cross.damage).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.player.level)).toBe(2);
  await expect(page.locator("#weapon-cross")).not.toHaveClass(/locked/);
  await expect(page.locator("#weapon-cross")).toHaveText(/Cross ×1/);

  await page.waitForFunction(() => window.__game.crosses.length > 0);
});

test("Grave Magnet stacks the pull radius and the HUD follows", async ({ page }) => {
  await bootMenu(page);
  await beginNight(page);
  await expect(page.locator("#magnet")).toHaveText("Magnet 175");
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
  expect(steps.radii).toEqual([175, 223, 271, 319, 320]);
  expect(steps.stacks).toBe(4);
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
  expect(snap.magnet).toBe(175);
  expect(snap.stacks).toBe(0);
  expect(snap.stake).toBe(1);
}
