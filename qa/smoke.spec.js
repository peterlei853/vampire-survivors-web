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
  await expect(page).toHaveTitle(/Nightfall — v0\.3\.0/);
  await expect(page.locator("#overlay-start")).toBeVisible();
  await expect(page.locator("#hud")).toBeHidden();

  const summary = await page.evaluate(() => window.__game.weaponSummary());
  expect(summary.stake.count).toBe(1);
  expect(summary.stake.damage).toBeGreaterThan(0);
  expect(summary.censer.owned).toBe(false);
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
      stake: game.weaponSummary().stake.count,
    };
  });
  expect(snap.hp).toBe(100);
  expect(snap.level).toBe(1);
  expect(snap.xp).toBe(0);
  expect(snap.kills).toBe(0);
  expect(snap.time).toBeLessThan(1);
  expect(snap.owned).toBe(false);
  expect(snap.stake).toBe(1);
}
