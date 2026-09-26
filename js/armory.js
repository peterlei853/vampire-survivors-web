/** Starter kits and the v0.7 weapons. Stake cards still edit the live kit on the player. */

import { drawWeapon } from "./weaponart.js";

export const WEAPON_CAP = 5;

export const CARD_ICON_IDS = [
  "stake",
  "crossbow",
  "dagger",
  "whip",
  "scythe",
  "cross",
  "pyre",
  "torch",
  "censer",
  "tome",
  "bloodDraught",
  "darkPact",
];

export const STARTERS = {
  stake: {
    id: "stake",
    name: "Wooden Stake",
    damage: 12,
    interval: 0.56,
    pierce: 0,
    speed: 520,
    life: 1.05,
    count: 1,
  },
  crossbow: {
    id: "crossbow",
    name: "Crossbow",
    damage: 16,
    interval: 0.68,
    pierce: 1,
    speed: 600,
    life: 1.05,
    count: 1,
  },
};

export function starterStats(id) {
  return STARTERS[id] || STARTERS.stake;
}

const OWNED_KEYS = ["censer", "pyre", "cross", "dagger", "whip", "scythe", "torch", "tome"];

/** Starter plus each unlocked weapon. The cap is 5. */
export function ownedWeaponCount(player) {
  let count = 1;
  for (const key of OWNED_KEYS) {
    if (player[key]?.owned) count += 1;
  }
  return count;
}

export function roomForWeapon(player) {
  return ownedWeaponCount(player) < WEAPON_CAP;
}

export class Dagger {
  constructor() {
    this.owned = false;
    this.count = 0;
    this.damage = 0;
    this.pierce = 0;
    this.interval = 0.4;
    this.timer = 0;
    this.speed = 640;
    this.life = 0.55;
    this.countRank = 0;
    this.damageRank = 0;
    this.pierceRank = 0;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.count = 1;
    this.damage = 7;
    this.pierce = 0;
    this.timer = 0.15;
    this.countRank = 1;
    this.damageRank = 1;
    this.pierceRank = 0;
  }

  addCount() {
    if (!this.owned) return;
    this.count = Math.min(4, this.count + 1);
    this.countRank = this.count;
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(16, this.damage + 3);
    this.damageRank = 1 + (this.damage - 7) / 3;
  }

  addPierce() {
    if (!this.owned) return;
    this.pierce = Math.min(2, this.pierce + 1);
    this.pierceRank = this.pierce;
  }
}

export class Whip {
  constructor() {
    this.owned = false;
    this.damage = 0;
    this.length = 150;
    this.both = false;
    this.interval = 1.4;
    this.timer = 0;
    this.swing = 0;
    this.sign = 1;
    this.damageRank = 0;
    this.lengthRank = 0;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.damage = 16;
    this.length = 150;
    this.both = false;
    this.timer = 0.35;
    this.damageRank = 1;
    this.lengthRank = 1;
  }

  addBoth() {
    if (!this.owned) return;
    this.both = true;
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(31, this.damage + 5);
    this.damageRank = 1 + (this.damage - 16) / 5;
  }

  addLength() {
    if (!this.owned) return;
    this.length = Math.min(230, this.length + 40);
    this.lengthRank = 1 + (this.length - 150) / 40;
  }

  draw(ctx, player, time) {
    if (!this.owned || this.swing <= 0) return;
    const signs = this.both ? [1, -1] : [this.sign];
    for (const sign of signs) {
      ctx.save();
      ctx.translate(player.x + sign * this.length * 0.5, player.y);
      ctx.imageSmoothingEnabled = false;
      if (!drawWeapon(ctx, "whip", "slash", time, sign > 0 ? 0 : Math.PI, this.length, 32)) {
        ctx.fillStyle = "rgba(200, 180, 255, 0.8)";
        ctx.fillRect(-this.length * 0.5, -6, this.length, 12);
      }
      ctx.restore();
    }
  }
}

export class Scythe {
  constructor() {
    this.owned = false;
    this.damage = 0;
    this.radius = 100;
    this.interval = 2.6;
    this.timer = 0;
    this.swing = 0;
    this.damageRank = 0;
    this.radiusRank = 0;
    this.hasteRank = 0;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.damage = 22;
    this.radius = 100;
    this.interval = 2.6;
    this.timer = 0.5;
    this.damageRank = 1;
    this.radiusRank = 1;
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(40, this.damage + 6);
    this.damageRank = 1 + (this.damage - 22) / 6;
  }

  addRadius() {
    if (!this.owned) return;
    this.radius = Math.min(160, this.radius + 20);
    this.radiusRank = 1 + (this.radius - 100) / 20;
  }

  addHaste() {
    if (!this.owned) return;
    this.interval = Math.max(1.6, this.interval * 0.85);
    this.hasteRank += 1;
  }

  draw(ctx, player, time) {
    if (!this.owned || this.swing <= 0) return;
    const spin = (1 - this.swing / 0.42) * Math.PI * 2;
    const reach = this.radius * 0.72;
    ctx.save();
    ctx.translate(player.x + Math.cos(spin) * reach, player.y + Math.sin(spin) * reach);
    ctx.imageSmoothingEnabled = false;
    if (!drawWeapon(ctx, "scythe", "projectile", time, 0, 64, 64)) {
      ctx.strokeStyle = "rgba(255, 70, 90, 0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class Torch {
  constructor() {
    this.owned = false;
    this.damage = 0;
    this.radius = 60;
    this.interval = 0.5;
    this.timer = 0;
    this.damageRank = 0;
    this.radiusRank = 0;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.damage = 3;
    this.radius = 60;
    this.timer = 0.2;
    this.damageRank = 1;
    this.radiusRank = 1;
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(9, this.damage + 2);
    this.damageRank = 1 + (this.damage - 3) / 2;
  }

  addRadius() {
    if (!this.owned) return;
    this.radius = Math.min(110, this.radius + 25);
    this.radiusRank = 1 + (this.radius - 60) / 25;
  }

  draw(ctx, player, time) {
    if (!this.owned) return;
    const diameter = this.radius * 2;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.imageSmoothingEnabled = false;
    if (!drawWeapon(ctx, "torch", "aura", time, 0, diameter, diameter)) {
      ctx.strokeStyle = "rgba(255, 150, 50, 0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class Tome {
  constructor() {
    this.owned = false;
    this.count = 0;
    this.damage = 0;
    this.interval = 3;
    this.timer = 0;
    this.countRank = 0;
    this.damageRank = 0;
  }

  unlock() {
    if (this.owned) return;
    this.owned = true;
    this.count = 2;
    this.damage = 11;
    this.timer = 0.6;
    this.countRank = 2;
    this.damageRank = 1;
  }

  addCount() {
    if (!this.owned) return;
    this.count = Math.min(5, this.count + 1);
    this.countRank = this.count;
  }

  addDamage() {
    if (!this.owned) return;
    this.damage = Math.min(23, this.damage + 3);
    this.damageRank = 1 + (this.damage - 11) / 3;
  }
}

export class Bat {
  constructor(x, y, damage, target) {
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.target = target;
    this.speed = 340;
    this.life = 2.8;
    this.radius = 12;
    this.age = 0;
    this.angle = 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.imageSmoothingEnabled = false;
    if (!drawWeapon(ctx, "tome", "projectile", this.age, this.angle, 56, 54)) {
      ctx.fillStyle = "#9a5cff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Heal and the pact. Only offered when the real table has fewer than three cards. */
export const FALLBACKS = [
  {
    id: "bloodDraught",
    name: "Blood Draught",
    blurb: "A mouthful of night. The wound closes.",
    icon: "bloodDraught",
    family: "bloodDraught",
    detail(player) {
      return `Heal ${Math.round(player.maxHp * 0.3)} (30% max HP)`;
    },
    apply(player) {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
    },
  },
  {
    id: "darkPact",
    name: "Dark Pact",
    blurb: "Every weapon bites harder. The mark stays.",
    icon: "darkPact",
    family: "darkPact",
    ranks: 10,
    level(player) {
      return player.pactStacks || 0;
    },
    maxed: (player) => (player.pactStacks || 0) >= 10,
    detail(player) {
      const next = Math.min(10, (player.pactStacks || 0) + 1);
      return `All damage +4% (${player.pactStacks || 0} → ${next})`;
    },
    apply(player) {
      if ((player.pactStacks || 0) >= 10) return;
      player.pactStacks = (player.pactStacks || 0) + 1;
      player.pact = 1 + 0.04 * player.pactStacks;
    },
  },
];

export function weaponUpgrades() {
  return [
    {
      id: "dagger",
      name: "Silver Dagger",
      blurb: "A knife in the direction you are walking.",
      family: "dagger",
      icon: "dagger",
      kind: "unlock",
      weight: () => 5,
      available: (player) => !player.dagger.owned && roomForWeapon(player),
      detail() {
        return "Unlock daggers (7 damage, every 0.40s)";
      },
      apply(player) {
        player.dagger.unlock();
      },
    },
    {
      id: "dagger-count",
      name: "More Daggers",
      blurb: "Another blade leaves with the first.",
      family: "dagger",
      icon: "dagger",
      ranks: 4,
      level: (player) => player.dagger.countRank,
      available: (player) => player.dagger.owned,
      maxed: (player) => player.dagger.count >= 4,
      detail(player) {
        return `Daggers ${player.dagger.count} → ${player.dagger.count + 1}`;
      },
      apply(player) {
        player.dagger.addCount();
      },
    },
    {
      id: "dagger-heat",
      name: "Sharper Daggers",
      blurb: "The silver bites deeper.",
      family: "dagger",
      icon: "dagger",
      ranks: 4,
      level: (player) => player.dagger.damageRank,
      available: (player) => player.dagger.owned,
      maxed: (player) => player.dagger.damage >= 16,
      detail(player) {
        const next = Math.min(16, player.dagger.damage + 3);
        return `Dagger damage ${player.dagger.damage} → ${next}`;
      },
      apply(player) {
        player.dagger.addDamage();
      },
    },
    {
      id: "dagger-pierce",
      name: "Piercing Daggers",
      blurb: "The knife keeps going.",
      family: "dagger",
      icon: "dagger",
      ranks: 3,
      level: (player) => player.dagger.pierceRank,
      available: (player) => player.dagger.owned,
      maxed: (player) => player.dagger.pierce >= 2,
      detail(player) {
        return `Dagger pierce ${player.dagger.pierce} → ${player.dagger.pierce + 1}`;
      },
      apply(player) {
        player.dagger.addPierce();
      },
    },
    {
      id: "whip",
      name: "Chain Whip",
      blurb: "A lash across the side you are facing.",
      family: "whip",
      icon: "whip",
      kind: "unlock",
      weight: () => 5,
      available: (player) => !player.whip.owned && roomForWeapon(player),
      detail() {
        return "Unlock a whip (16 damage, length 150)";
      },
      apply(player) {
        player.whip.unlock();
      },
    },
    {
      id: "whip-both",
      name: "Both Sides",
      blurb: "The chain answers on the left and the right.",
      family: "whip",
      icon: "whip",
      ranks: 1,
      level: () => 0,
      available: (player) => player.whip.owned,
      maxed: (player) => player.whip.both,
      detail() {
        return "Lash both sides";
      },
      apply(player) {
        player.whip.addBoth();
      },
    },
    {
      id: "whip-heat",
      name: "Heavier Chains",
      blurb: "The links land harder.",
      family: "whip",
      icon: "whip",
      ranks: 4,
      level: (player) => player.whip.damageRank,
      available: (player) => player.whip.owned,
      maxed: (player) => player.whip.damage >= 31,
      detail(player) {
        const next = Math.min(31, player.whip.damage + 5);
        return `Whip damage ${player.whip.damage} → ${next}`;
      },
      apply(player) {
        player.whip.addDamage();
      },
    },
    {
      id: "whip-reach",
      name: "Longer Lash",
      blurb: "The chain reaches farther from your hand.",
      family: "whip",
      icon: "whip",
      ranks: 3,
      level: (player) => player.whip.lengthRank,
      available: (player) => player.whip.owned,
      maxed: (player) => player.whip.length >= 230,
      detail(player) {
        const next = Math.min(230, player.whip.length + 40);
        return `Whip length ${player.whip.length} → ${next}`;
      },
      apply(player) {
        player.whip.addLength();
      },
    },
    {
      id: "scythe",
      name: "Scythe",
      blurb: "A full circle of the blade around you.",
      family: "scythe",
      icon: "scythe",
      kind: "unlock",
      weight: () => 5,
      available: (player) => !player.scythe.owned && roomForWeapon(player),
      detail() {
        return "Unlock a scythe (22 damage, radius 100)";
      },
      apply(player) {
        player.scythe.unlock();
      },
    },
    {
      id: "scythe-heat",
      name: "Deeper Cut",
      blurb: "The sweep takes more with it.",
      family: "scythe",
      icon: "scythe",
      ranks: 4,
      level: (player) => player.scythe.damageRank,
      available: (player) => player.scythe.owned,
      maxed: (player) => player.scythe.damage >= 40,
      detail(player) {
        const next = Math.min(40, player.scythe.damage + 6);
        return `Scythe damage ${player.scythe.damage} → ${next}`;
      },
      apply(player) {
        player.scythe.addDamage();
      },
    },
    {
      id: "scythe-reach",
      name: "Wider Sweep",
      blurb: "The circle grows.",
      family: "scythe",
      icon: "scythe",
      ranks: 4,
      level: (player) => player.scythe.radiusRank,
      available: (player) => player.scythe.owned,
      maxed: (player) => player.scythe.radius >= 160,
      detail(player) {
        const next = Math.min(160, player.scythe.radius + 20);
        return `Sweep radius ${player.scythe.radius} → ${next}`;
      },
      apply(player) {
        player.scythe.addRadius();
      },
    },
    {
      id: "scythe-haste",
      name: "Faster Sweep",
      blurb: "The blade comes back around sooner.",
      family: "scythe",
      icon: "scythe",
      ranks: 3,
      level: (player) => player.scythe.hasteRank,
      available: (player) => player.scythe.owned,
      maxed: (player) => player.scythe.interval <= 1.6 + 1e-6,
      detail(player) {
        const next = Math.max(1.6, player.scythe.interval * 0.85);
        return `Sweep every ${player.scythe.interval.toFixed(2)}s → ${next.toFixed(2)}s`;
      },
      apply(player) {
        player.scythe.addHaste();
      },
    },
    {
      id: "torch",
      name: "Torch",
      blurb: "A ring of fire that keeps burning.",
      family: "torch",
      icon: "torch",
      kind: "unlock",
      weight: () => 5,
      available: (player) => !player.torch.owned && roomForWeapon(player),
      detail() {
        return "Unlock a torch aura (3 damage, every 0.50s)";
      },
      apply(player) {
        player.torch.unlock();
      },
    },
    {
      id: "torch-heat",
      name: "Hotter Torch",
      blurb: "The ring bites harder.",
      family: "torch",
      icon: "torch",
      ranks: 4,
      level: (player) => player.torch.damageRank,
      available: (player) => player.torch.owned,
      maxed: (player) => player.torch.damage >= 9,
      detail(player) {
        const next = Math.min(9, player.torch.damage + 2);
        return `Torch damage ${player.torch.damage} → ${next}`;
      },
      apply(player) {
        player.torch.addDamage();
      },
    },
    {
      id: "torch-reach",
      name: "Wider Torch",
      blurb: "The fire stands farther out.",
      family: "torch",
      icon: "torch",
      ranks: 3,
      level: (player) => player.torch.radiusRank,
      available: (player) => player.torch.owned,
      maxed: (player) => player.torch.radius >= 110,
      detail(player) {
        const next = Math.min(110, player.torch.radius + 25);
        return `Torch radius ${player.torch.radius} → ${next}`;
      },
      apply(player) {
        player.torch.addRadius();
      },
    },
    {
      id: "tome",
      name: "Bat Tome",
      blurb: "Bats peel off the page and hunt.",
      family: "tome",
      icon: "tome",
      kind: "unlock",
      weight: () => 5,
      available: (player) => !player.tome.owned && roomForWeapon(player),
      detail() {
        return "Unlock a tome (2 bats, 11 damage)";
      },
      apply(player) {
        player.tome.unlock();
      },
    },
    {
      id: "tome-count",
      name: "More Bats",
      blurb: "Another bat leaves the page.",
      family: "tome",
      icon: "tome",
      ranks: 5,
      level: (player) => player.tome.countRank,
      available: (player) => player.tome.owned,
      maxed: (player) => player.tome.count >= 5,
      detail(player) {
        return `Bats ${player.tome.count} → ${player.tome.count + 1}`;
      },
      apply(player) {
        player.tome.addCount();
      },
    },
    {
      id: "tome-heat",
      name: "Hungrier Bats",
      blurb: "The flock hits harder.",
      family: "tome",
      icon: "tome",
      ranks: 5,
      level: (player) => player.tome.damageRank,
      available: (player) => player.tome.owned,
      maxed: (player) => player.tome.damage >= 23,
      detail(player) {
        const next = Math.min(23, player.tome.damage + 3);
        return `Bat damage ${player.tome.damage} → ${next}`;
      },
      apply(player) {
        player.tome.addDamage();
      },
    },
  ];
}
