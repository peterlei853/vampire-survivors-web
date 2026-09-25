extends RefCounted
class_name NightData

## Numbers ported from the web build (js/player.js, enemy.js, game.js, and the weapons).

const VERSION = "0.4.0"
const MAGNET_BASE = 175.0
const MAGNET_STEP = 48.0
const MAGNET_MAX = 320.0
const PICKUP_RADIUS = 22.0
const ELITE_MIN_TIME = 90.0
const ELITE_TIME = 100.0
const ELITE_KILLS = 80
const ELITE_WARN = 2.4

const CENSER_MAX_ORBS = 4
const CENSER_MAX_DAMAGE = 20
const CENSER_MAX_RADIUS = 132.0
const CENSER_DAMAGE_STEP = 4
const CENSER_RADIUS_STEP = 18.0

const PYRE_MAX_CHARGES = 3
const PYRE_MAX_DAMAGE = 12
const PYRE_MAX_RADIUS = 78.0
const PYRE_DAMAGE_STEP = 2
const PYRE_RADIUS_STEP = 12.0

const CROSS_MAX_COUNT = 3
const CROSS_MAX_DAMAGE = 22
const CROSS_MAX_RANGE = 320.0
const CROSS_DAMAGE_STEP = 4
const CROSS_RANGE_STEP = 36.0

const ENEMY_TYPES = {
	"shambler": {"hp": 18, "speed": 78.0, "radius": 13.0, "color": "c15a3e", "damage": 8, "xp": 2},
	"bat": {"hp": 10, "speed": 196.0, "radius": 10.0, "color": "8a56b0", "damage": 7, "xp": 2},
	"brute": {"hp": 84, "speed": 48.0, "radius": 20.0, "color": "7a3034", "damage": 16, "xp": 5},
	"warden": {"hp": 280, "speed": 56.0, "radius": 26.0, "color": "8e243f", "damage": 14, "xp": 0},
}

static var _upgrades: Array = []


static func xp_required_for(level: int) -> int:
	var n = maxi(0, level - 1)
	return roundi(40.0 + float(n) * 18.0 + float(n) * float(n) * 2.2)


static func night_threat(time: float, kills: int) -> float:
	var minutes = maxf(0.0, time) / 60.0
	var from_time = minutes * 0.28 + pow(maxf(0.0, minutes - 0.75), 2.0) * 1.35
	var from_kills = minf(1.1, maxf(0.0, float(kills)) / 220.0) * 0.35
	return from_time + from_kills


static func spawn_interval_for(time: float, kills: int) -> float:
	return maxf(0.32, 1.7 / (1.0 + night_threat(time, kills) * 0.5))


static func spawn_count_for(time: float, kills: int) -> int:
	return mini(5, 1 + int(floor(night_threat(time, kills) / 1.5)))


static func max_enemies_for(time: float, kills: int) -> int:
	return mini(140, roundi(12.0 + night_threat(time, kills) * 14.0))


static func elite_due(time: float, kills: int) -> bool:
	if time < ELITE_MIN_TIME:
		return false
	return time >= ELITE_TIME or kills >= ELITE_KILLS


static func format_time(seconds: float) -> String:
	var safe = maxi(0, int(floor(seconds)))
	return "%02d:%02d" % [int(safe / 60), safe % 60]


static func hash01(ix: int, iy: int) -> float:
	var n = _u32(_imul(ix, 374761393) + _imul(iy, 668265263))
	n = _imul(n ^ _u32(n >> 13), 1274126177)
	n = _u32(n)
	return float(_u32(n ^ _u32(n >> 16))) / 4294967296.0


static func dist_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
	var abx = bx - ax
	var aby = by - ay
	var apx = px - ax
	var apy = py - ay
	var ab2 = abx * abx + aby * aby
	if ab2 == 0.0:
		ab2 = 1.0
	var t = clampf((apx * abx + apy * aby) / ab2, 0.0, 1.0)
	var cx = ax + abx * t
	var cy = ay + aby * t
	return sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))


static func _u32(n: int) -> int:
	return n & 0xFFFFFFFF


static func _imul(a: int, b: int) -> int:
	var a0 = a & 0xFFFF
	var a1 = (a >> 16) & 0xFFFF
	var b0 = b & 0xFFFF
	var b1 = (b >> 16) & 0xFFFF
	var p00 = a0 * b0
	var mid = (p00 >> 16) + (a0 * b1 & 0xFFFF) + (a1 * b0 & 0xFFFF)
	return ((p00 & 0xFFFF) | ((mid & 0xFFFF) << 16)) & 0xFFFFFFFF


static func all_upgrades() -> Array:
	if _upgrades.is_empty():
		_upgrades = _build_upgrades()
	return _upgrades


static func find_upgrade(id: String):
	for upgrade in all_upgrades():
		if upgrade.id == id:
			return upgrade
	return null


static func apply_upgrade(hunter, id: String) -> bool:
	var upgrade = find_upgrade(id)
	if upgrade == null:
		return false
	if not upgrade.is_available(hunter):
		return false
	if upgrade.is_maxed(hunter):
		return false
	upgrade.apply_to.call(hunter)
	return true


static func roll_upgrades(hunter, count: int) -> Array:
	var pool: Array = []
	for upgrade in all_upgrades():
		if not upgrade.is_available(hunter):
			continue
		if upgrade.is_maxed(hunter):
			continue
		pool.append(upgrade)
	var picks: Array = []
	while picks.size() < count and pool.size() > 0:
		var total = 0.0
		for upgrade in pool:
			total += upgrade.weight
		var roll = randf() * total
		var index = pool.size() - 1
		for i in pool.size():
			roll -= pool[i].weight
			if roll <= 0.0:
				index = i
				break
		picks.append(pool[index])
		pool.remove_at(index)
	# Unshift cross, then pyre, then the censer, so the censer stays in front.
	var pinned = ["cross", "pyre", "censer"]
	for id in pinned:
		var unlock = find_upgrade(id)
		if unlock == null:
			continue
		if not unlock.is_available(hunter):
			continue
		if unlock.is_maxed(hunter):
			continue
		var already = false
		for pick in picks:
			if pick.id == id:
				already = true
				break
		if already:
			continue
		picks.push_front(unlock)
	var pin_ids = {"cross": true, "pyre": true, "censer": true}
	while picks.size() > count:
		var removed = false
		for i in range(picks.size() - 1, -1, -1):
			var upgrade = picks[i]
			var still_pinned: bool = pin_ids.has(upgrade.id) and upgrade.is_available(hunter)
			if still_pinned:
				continue
			picks.remove_at(i)
			removed = true
			break
		if not removed:
			picks.resize(count)
			break
	return picks


static func _build_upgrades() -> Array:
	var magnet_max = MAGNET_MAX
	var magnet_step = MAGNET_STEP
	var censer_max_orbs = CENSER_MAX_ORBS
	var censer_max_damage = CENSER_MAX_DAMAGE
	var censer_damage_step = CENSER_DAMAGE_STEP
	var censer_max_radius = CENSER_MAX_RADIUS
	var censer_radius_step = CENSER_RADIUS_STEP
	var pyre_max_charges = PYRE_MAX_CHARGES
	var pyre_max_damage = PYRE_MAX_DAMAGE
	var pyre_damage_step = PYRE_DAMAGE_STEP
	var pyre_max_radius = PYRE_MAX_RADIUS
	var pyre_radius_step = PYRE_RADIUS_STEP
	var cross_max_count = CROSS_MAX_COUNT
	var cross_max_damage = CROSS_MAX_DAMAGE
	var cross_damage_step = CROSS_DAMAGE_STEP
	var cross_max_range = CROSS_MAX_RANGE
	var cross_range_step = CROSS_RANGE_STEP
	return [
		_upgrade("damage", "Sharpened Stake", "Each bolt bites deeper.", "", 1.0, Callable(), Callable(),
			func(p): return "Damage %d → %d" % [p.damage, p.damage + 5],
			func(p): p.damage += 5),
		_upgrade("haste", "Hasty Ritual", "The stake flies more often.", "", 1.0, Callable(),
			func(p): return p.attack_interval <= 0.16 + 0.000001,
			func(p):
				var next = maxf(0.16, p.attack_interval * 0.88)
				return "Attack every %.2fs → %.2fs" % [p.attack_interval, next],
			func(p): p.attack_interval = maxf(0.16, p.attack_interval * 0.88)),
		_upgrade("speed", "Fleet Foot", "Cover more of the field.", "", 1.0, Callable(),
			func(p): return p.speed >= 400.0,
			func(p):
				var next = minf(400.0, float(roundi(p.speed * 1.1)))
				return "Move speed %d → %d" % [roundi(p.speed), roundi(next)],
			func(p): p.speed = minf(400.0, float(roundi(p.speed * 1.1)))),
		_upgrade("vigor", "Sanguine Vigour", "A deeper well of blood, and some of it back.", "", 1.0, Callable(), Callable(),
			func(p): return "Max HP %d → %d, heal 25" % [p.max_hp, p.max_hp + 25],
			func(p):
				p.max_hp += 25
				p.hp = minf(float(p.max_hp), p.hp + 25.0)),
		_upgrade("bolts", "Twin Bolts", "Loose another stake at the same time.", "", 1.0, Callable(),
			func(p): return p.projectile_count >= 5,
			func(p): return "Bolts %d → %d" % [p.projectile_count, p.projectile_count + 1],
			func(p): p.projectile_count += 1),
		_upgrade("magnet", "Grave Magnet", "Gems rush in from farther away.", "magnet", 1.0, Callable(),
			func(p): return p.magnet_radius >= magnet_max - 0.001,
			func(p):
				var next = minf(magnet_max, p.magnet_radius + magnet_step)
				return "Pull radius %d → %d" % [int(p.magnet_radius), int(next)],
			func(p):
				p.magnet_radius = minf(magnet_max, p.magnet_radius + magnet_step)
				p.magnet_stacks += 1),
		_upgrade("pierce", "Piercing Ash", "Bolts pass through another foe.", "", 1.0, Callable(),
			func(p): return p.pierce >= 3,
			func(p): return "Extra targets %d → %d" % [p.pierce, p.pierce + 1],
			func(p): p.pierce += 1),
		_upgrade("censer", "Warding Censer", "A silver censer wakes and sweeps the dark around you.", "censer", 5.0,
			func(p): return not p.censer.owned, Callable(),
			func(_p): return "Unlock an orbiting censer (8 damage)",
			func(p): p.censer.unlock()),
		_upgrade("censer-orbs", "Another Censer", "Another lamp joins the sweep.", "censer", 1.0,
			func(p): return p.censer.owned,
			func(p): return p.censer.orbs >= censer_max_orbs,
			func(p): return "Censers %d → %d" % [p.censer.orbs, p.censer.orbs + 1],
			func(p): p.censer.add_orb()),
		_upgrade("censer-heat", "Hot Ash", "The censers burn hotter as they pass.", "censer", 1.0,
			func(p): return p.censer.owned,
			func(p): return p.censer.damage >= censer_max_damage,
			func(p):
				var next = mini(censer_max_damage, p.censer.damage + censer_damage_step)
				return "Censer damage %d → %d" % [p.censer.damage, next],
			func(p): p.censer.add_damage()),
		_upgrade("censer-reach", "Wider Vigil", "The sweep reaches farther from your side.", "censer", 1.0,
			func(p): return p.censer.owned,
			func(p): return p.censer.radius >= censer_max_radius - 0.001,
			func(p):
				var next = minf(censer_max_radius, p.censer.radius + censer_radius_step)
				return "Sweep reach %d → %d" % [int(p.censer.radius), int(next)],
			func(p): p.censer.add_radius()),
		_upgrade("pyre", "Cinder Pyre", "A flask bursts on the nearest foe and keeps burning.", "pyre", 5.0,
			func(p): return not p.pyre.owned, Callable(),
			func(_p): return "Unlock a pyre pool (5 damage a tick)",
			func(p): p.pyre.unlock()),
		_upgrade("pyre-charges", "Another Flask", "Another flask leaves the hand with the first.", "pyre", 1.0,
			func(p): return p.pyre.owned,
			func(p): return p.pyre.charges >= pyre_max_charges,
			func(p): return "Flasks %d → %d" % [p.pyre.charges, p.pyre.charges + 1],
			func(p): p.pyre.add_charge()),
		_upgrade("pyre-heat", "Hotter Pitch", "The pool bites harder each time it flares.", "pyre", 1.0,
			func(p): return p.pyre.owned,
			func(p): return p.pyre.damage >= pyre_max_damage,
			func(p):
				var next = mini(pyre_max_damage, p.pyre.damage + pyre_damage_step)
				return "Pyre damage %d → %d" % [p.pyre.damage, next],
			func(p): p.pyre.add_damage()),
		_upgrade("pyre-reach", "Wider Pyre", "The fire spreads farther from where the flask lands.", "pyre", 1.0,
			func(p): return p.pyre.owned,
			func(p): return p.pyre.radius >= pyre_max_radius - 0.001,
			func(p):
				var next = minf(pyre_max_radius, p.pyre.radius + pyre_radius_step)
				return "Pool radius %d → %d" % [int(p.pyre.radius), int(next)],
			func(p): p.pyre.add_radius()),
		_upgrade("cross", "Ash Cross", "A cross flies out and cuts again on the way home.", "cross", 5.0,
			func(p): return not p.cross.owned, Callable(),
			func(_p): return "Unlock a returning cross (10 damage)",
			func(p): p.cross.unlock()),
		_upgrade("cross-count", "Another Cross", "Another cross leaves with the first.", "cross", 1.0,
			func(p): return p.cross.owned,
			func(p): return p.cross.count >= cross_max_count,
			func(p): return "Crosses %d → %d" % [p.cross.count, p.cross.count + 1],
			func(p): p.cross.add_count()),
		_upgrade("cross-heat", "Heavier Ash", "The cross bites deeper on both passes.", "cross", 1.0,
			func(p): return p.cross.owned,
			func(p): return p.cross.damage >= cross_max_damage,
			func(p):
				var next = mini(cross_max_damage, p.cross.damage + cross_damage_step)
				return "Cross damage %d → %d" % [p.cross.damage, next],
			func(p): p.cross.add_damage()),
		_upgrade("cross-reach", "Longer Flight", "The cross travels farther before it turns back.", "cross", 1.0,
			func(p): return p.cross.owned,
			func(p): return p.cross.flight >= cross_max_range - 0.001,
			func(p):
				var next = minf(cross_max_range, p.cross.flight + cross_range_step)
				return "Flight %d → %d" % [int(p.cross.flight), int(next)],
			func(p): p.cross.add_range()),
	]


static func _upgrade(id: String, title: String, blurb: String, family: String, weight: float, available_if: Callable, maxed_if: Callable, detail_of: Callable, apply_to: Callable):
	var upgrade = Upgrade.new()
	upgrade.id = id
	upgrade.title = title
	upgrade.blurb = blurb
	upgrade.family = family
	upgrade.weight = weight
	upgrade.available_if = available_if
	upgrade.maxed_if = maxed_if
	upgrade.detail_of = detail_of
	upgrade.apply_to = apply_to
	return upgrade


class Upgrade extends RefCounted:
	var id = ""
	var title = ""
	var blurb = ""
	var family = ""
	var weight = 1.0
	var available_if = Callable()
	var maxed_if = Callable()
	var detail_of = Callable()
	var apply_to = Callable()

	func is_available(hunter) -> bool:
		if available_if.is_valid():
			return bool(available_if.call(hunter))
		return true

	func is_maxed(hunter) -> bool:
		if maxed_if.is_valid():
			return bool(maxed_if.call(hunter))
		return false

	func detail(hunter) -> String:
		return str(detail_of.call(hunter))


class Censer extends RefCounted:
	var owned = false
	var orbs = 0
	var damage = 0
	var radius = 78.0
	var inner = 22.0
	var thickness = 16.0
	var hit_cooldown = 0.2
	var angle = -PI / 2.0
	var spin = 3.35

	func unlock() -> void:
		if owned:
			return
		owned = true
		orbs = 1
		damage = 8
		radius = 78.0

	func add_orb() -> void:
		if not owned:
			return
		orbs = mini(4, orbs + 1)

	func add_damage() -> void:
		if not owned:
			return
		damage = mini(20, damage + 4)

	func add_radius() -> void:
		if not owned:
			return
		radius = minf(132.0, radius + 18.0)

	func advance(dt: float) -> void:
		if not owned:
			return
		angle += spin * dt

	func spokes(hunter) -> Array:
		var list: Array = []
		if not owned or orbs <= 0:
			return list
		for i in orbs:
			var ang = angle + (float(i) * TAU) / float(orbs)
			var c = cos(ang)
			var s = sin(ang)
			var spoke = Spoke.new()
			spoke.angle = ang
			spoke.x0 = hunter.x + c * inner
			spoke.y0 = hunter.y + s * inner
			spoke.x1 = hunter.x + c * radius
			spoke.y1 = hunter.y + s * radius
			list.append(spoke)
		return list

	func touches(foe, spoke_list: Array) -> bool:
		var reach = thickness + foe.radius * 0.55
		for spoke in spoke_list:
			if _dist_to_segment(foe.x, foe.y, spoke.x0, spoke.y0, spoke.x1, spoke.y1) <= reach:
				return true
		return false

	func _dist_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
		var abx = bx - ax
		var aby = by - ay
		var apx = px - ax
		var apy = py - ay
		var ab2 = abx * abx + aby * aby
		if ab2 == 0.0:
			ab2 = 1.0
		var t = clampf((apx * abx + apy * aby) / ab2, 0.0, 1.0)
		var cx = ax + abx * t
		var cy = ay + aby * t
		return sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))


class Spoke extends RefCounted:
	var angle = 0.0
	var x0 = 0.0
	var y0 = 0.0
	var x1 = 0.0
	var y1 = 0.0


class Pyre extends RefCounted:
	var owned = false
	var charges = 0
	var damage = 0
	var radius = 46.0
	var interval = 1.75
	var timer = 0.0
	var duration = 2.05
	var tick = 0.32

	func unlock() -> void:
		if owned:
			return
		owned = true
		charges = 1
		damage = 5
		radius = 46.0
		timer = 0.3

	func add_charge() -> void:
		if not owned:
			return
		charges = mini(3, charges + 1)

	func add_damage() -> void:
		if not owned:
			return
		damage = mini(12, damage + 2)

	func add_radius() -> void:
		if not owned:
			return
		radius = minf(78.0, radius + 12.0)


class AshCross extends RefCounted:
	var owned = false
	var count = 0
	var damage = 0
	var flight = 210.0
	var interval = 1.2
	var timer = 0.0
	var speed = 330.0

	func unlock() -> void:
		if owned:
			return
		owned = true
		count = 1
		damage = 10
		flight = 210.0
		timer = 0.2

	func add_count() -> void:
		if not owned:
			return
		count = mini(3, count + 1)

	func add_damage() -> void:
		if not owned:
			return
		damage = mini(22, damage + 4)

	func add_range() -> void:
		if not owned:
			return
		flight = minf(320.0, flight + 36.0)


class Hunter extends RefCounted:
	var x = 0.0
	var y = 0.0
	var radius = 14.0
	var speed = 168.0
	var max_hp = 100
	var hp = 100.0
	var level = 1
	var xp = 0.0
	var xp_to_next = 40
	var damage = 12
	var attack_interval = 0.56
	var attack_timer = 0.0
	var projectile_speed = 520.0
	var projectile_life = 1.05
	var projectile_count = 1
	var pierce = 0
	var magnet_radius = 175.0
	var magnet_stacks = 0
	var pickup_radius = 22.0
	var invuln = 0.0
	var aim = 0.0
	var censer: Censer
	var pyre: Pyre
	var cross: AshCross

	func _init(px: float = 0.0, py: float = 0.0) -> void:
		x = px
		y = py
		magnet_radius = 175.0
		pickup_radius = 22.0
		xp_to_next = _xp_for(1)
		censer = Censer.new()
		pyre = Pyre.new()
		cross = AshCross.new()

	func update(dt: float, axis: Vector2) -> void:
		if axis.x != 0.0 or axis.y != 0.0:
			x += axis.x * speed * dt
			y += axis.y * speed * dt
			aim = atan2(axis.y, axis.x)
		if invuln > 0.0:
			invuln = maxf(0.0, invuln - dt)
		if attack_timer > 0.0:
			attack_timer = maxf(0.0, attack_timer - dt)

	func gain_xp(amount: float) -> Array:
		var gained: Array = []
		xp += amount
		while xp >= float(xp_to_next):
			xp -= float(xp_to_next)
			level += 1
			hp = minf(float(max_hp), hp + float(max_hp) * 0.08)
			xp_to_next = _xp_for(level)
			gained.append(level)
		return gained

	func _xp_for(next_level: int) -> int:
		var n = maxi(0, next_level - 1)
		return roundi(40.0 + float(n) * 18.0 + float(n) * float(n) * 2.2)


class Foe extends RefCounted:
	static var next_id = 1
	var id = 0
	var type = "shambler"
	var x = 0.0
	var y = 0.0
	var radius = 13.0
	var speed = 78.0
	var max_hp = 1
	var hp = 1.0
	var damage = 1
	var xp = 2
	var color = Color.WHITE
	var hit_flash = 0.0
	var censer_cd = 0.0
	var bob = 0.0
	var phase = "chase"
	var special_timer = 0.0
	var windup = 0.0
	var windup_max = 1.05
	var mark = null
	var pulse = null

	func _init(type_name: String, px: float, py: float, time: float) -> void:
		var base: Dictionary = {
			"shambler": {"hp": 18, "speed": 78.0, "radius": 13.0, "color": "c15a3e", "damage": 8, "xp": 2},
			"bat": {"hp": 10, "speed": 196.0, "radius": 10.0, "color": "8a56b0", "damage": 7, "xp": 2},
			"brute": {"hp": 84, "speed": 48.0, "radius": 20.0, "color": "7a3034", "damage": 16, "xp": 5},
			"warden": {"hp": 280, "speed": 56.0, "radius": 26.0, "color": "8e243f", "damage": 14, "xp": 0},
		}
		if not base.has(type_name):
			type_name = "shambler"
		base = base[type_name]
		var hp_scale = 1.0 + maxf(0.0, time - 30.0) / 110.0
		var speed_scale = 1.0 + minf(0.5, maxf(0.0, time - 40.0) / 220.0)
		var dmg_scale = 1.0 + maxf(0.0, time - 45.0) / 200.0
		id = next_id
		next_id += 1
		type = type_name
		x = px
		y = py
		radius = float(base["radius"])
		speed = float(base["speed"]) * speed_scale
		max_hp = maxi(1, roundi(float(base["hp"]) * hp_scale))
		hp = float(max_hp)
		damage = maxi(1, roundi(float(base["damage"]) * dmg_scale))
		xp = int(base["xp"])
		color = Color(str(base["color"]))
		bob = randf() * TAU
		special_timer = 1.5 if type_name == "warden" else 0.0

	func update(dt: float, hunter) -> void:
		var spd = speed
		if type == "warden":
			_step_warden(dt, hunter)
			if phase == "windup":
				spd *= 0.22
		var dx = hunter.x - x
		var dy = hunter.y - y
		var dist = sqrt(dx * dx + dy * dy)
		if dist == 0.0:
			dist = 1.0
		x += (dx / dist) * spd * dt
		y += (dy / dist) * spd * dt
		bob += dt * (7.0 if type == "bat" else 3.0)
		if type == "bat":
			x += (-dy / dist) * sin(bob) * 36.0 * dt
			y += (dx / dist) * sin(bob) * 36.0 * dt
		if hit_flash > 0.0:
			hit_flash = maxf(0.0, hit_flash - dt)
		if censer_cd > 0.0:
			censer_cd = maxf(0.0, censer_cd - dt)

	func _step_warden(dt: float, hunter) -> void:
		if phase == "chase":
			special_timer -= dt
			if special_timer <= 0.0:
				phase = "windup"
				windup_max = 1.05
				windup = windup_max
				var planted = Mark.new()
				planted.x = hunter.x
				planted.y = hunter.y
				planted.radius = 86.0
				planted.burst = 0.0
				mark = planted
		elif phase == "windup":
			windup -= dt
			if windup <= 0.0 and mark != null:
				var burst = Pulse.new()
				burst.x = mark.x
				burst.y = mark.y
				burst.radius = mark.radius
				burst.damage = damage + 12
				pulse = burst
				mark.burst = 0.32
				phase = "chase"
				special_timer = 2.7
		if mark != null and mark.burst > 0.0:
			mark.burst -= dt
			if mark.burst <= 0.0 and phase != "windup":
				mark = null


class Mark extends RefCounted:
	var x = 0.0
	var y = 0.0
	var radius = 86.0
	var burst = 0.0


class Pulse extends RefCounted:
	var x = 0.0
	var y = 0.0
	var radius = 86.0
	var damage = 1


class Stake extends RefCounted:
	var x = 0.0
	var y = 0.0
	var vx = 0.0
	var vy = 0.0
	var damage = 1
	var hits_left = 1
	var life = 1.0
	var radius = 5.0
	var hit_ids = {}

	func _init(px: float, py: float, pvx: float, pvy: float, dmg: int, pierce: int, lifetime: float) -> void:
		x = px
		y = py
		vx = pvx
		vy = pvy
		damage = dmg
		hits_left = pierce + 1
		life = lifetime

	func update(dt: float) -> void:
		x += vx * dt
		y += vy * dt
		life -= dt


class Gem extends RefCounted:
	var x = 0.0
	var y = 0.0
	var value = 1
	var size = 6.0
	var color = Color("7ddec0")
	var rich = false
	var bob = 0.0
	var age = 0.0

	func _init(px: float, py: float, gem_value: int) -> void:
		x = px
		y = py
		value = gem_value
		size = 13.0 if gem_value >= 20 else (8.0 if gem_value >= 5 else 6.0)
		color = Color("fff1c2") if gem_value >= 20 else (Color("e6c36a") if gem_value >= 5 else Color("7ddec0"))
		rich = gem_value >= 20
		bob = randf() * TAU

	func update(dt: float, hunter) -> void:
		bob += dt * 3.0
		age += dt
		var dx = hunter.x - x
		var dy = hunter.y - y
		var dist = sqrt(dx * dx + dy * dy)
		if dist == 0.0:
			dist = 1.0
		var pull = 0.0
		if dist < hunter.magnet_radius:
			var closeness = 1.0 - dist / hunter.magnet_radius
			pull = 340.0 + closeness * 680.0
		elif age > 1.1:
			pull = minf(hunter.speed + 90.0, 140.0 + (age - 1.1) * 220.0)
		if pull > 0.0:
			x += (dx / dist) * pull * dt
			y += (dy / dist) * pull * dt

	func collected_by(hunter) -> bool:
		var dx = hunter.x - x
		var dy = hunter.y - y
		return sqrt(dx * dx + dy * dy) <= hunter.pickup_radius + size


class Flask extends RefCounted:
	var x = 0.0
	var y = 0.0
	var sx = 0.0
	var sy = 0.0
	var tx = 0.0
	var ty = 0.0
	var life = 0.28
	var max_life = 0.28
	var spec = {}

	func _init(px: float, py: float, target_x: float, target_y: float, flask_spec: Dictionary) -> void:
		x = px
		y = py
		sx = px
		sy = py
		tx = target_x
		ty = target_y
		spec = flask_spec

	func update(dt: float) -> void:
		life -= dt
		var t = 1.0 - maxf(0.0, life) / max_life
		x = sx + (tx - sx) * t
		y = sy + (ty - sy) * t - sin(t * PI) * 26.0

	func done() -> bool:
		return life <= 0.0


class Pool extends RefCounted:
	var x = 0.0
	var y = 0.0
	var radius = 46.0
	var damage = 1
	var life = 1.0
	var max_life = 1.0
	var tick = 0.32
	var cool = {}

	func _init(px: float, py: float, pool_radius: float, dmg: int, duration: float, tick_time: float) -> void:
		x = px
		y = py
		radius = pool_radius
		damage = dmg
		life = duration
		max_life = duration
		tick = tick_time

	func update(dt: float) -> void:
		life -= dt
		_decay_cool(dt)

	func ready_for(foe) -> bool:
		return not cool.has(foe.id)

	func mark(foe) -> void:
		cool[foe.id] = tick

	func _decay_cool(dt: float) -> void:
		var dead: Array = []
		for id in cool.keys():
			var next: float = float(cool[id]) - dt
			if next <= 0.0:
				dead.append(id)
			else:
				cool[id] = next
		for id in dead:
			cool.erase(id)


class Bolt extends RefCounted:
	var x = 0.0
	var y = 0.0
	var angle = 0.0
	var spin = 0.0
	var damage = 1
	var speed = 330.0
	var flight = 210.0
	var traveled = 0.0
	var returning = false
	var radius = 13.0
	var life = 3.2
	var cool = {}

	func _init(px: float, py: float, ang: float, dmg: int, bolt_speed: float, bolt_range: float) -> void:
		x = px
		y = py
		angle = ang
		spin = randf() * PI
		damage = dmg
		speed = bolt_speed
		flight = bolt_range

	func update(dt: float, hunter) -> bool:
		_decay_cool(dt)
		spin += dt * 9.0
		var step = speed * dt
		if not returning:
			x += cos(angle) * step
			y += sin(angle) * step
			traveled += step
			if traveled >= flight:
				returning = true
		else:
			var dx = hunter.x - x
			var dy = hunter.y - y
			var dist = sqrt(dx * dx + dy * dy)
			if dist <= hunter.radius + 6.0:
				return false
			angle = atan2(dy, dx)
			var back = step * 1.12
			x += cos(angle) * back
			y += sin(angle) * back
		life -= dt
		return life > 0.0

	func ready_for(foe) -> bool:
		return not cool.has(foe.id)

	func mark(foe) -> void:
		cool[foe.id] = 0.26

	func _decay_cool(dt: float) -> void:
		var dead: Array = []
		for id in cool.keys():
			var next: float = float(cool[id]) - dt
			if next <= 0.0:
				dead.append(id)
			else:
				cool[id] = next
		for id in dead:
			cool.erase(id)


class Spark extends RefCounted:
	var x = 0.0
	var y = 0.0
	var vx = 0.0
	var vy = 0.0
	var life = 0.4
	var max_life = 0.4
	var color = Color.WHITE
	var radius = 2.0

	func _init(px: float, py: float, col: Color) -> void:
		var ang = randf() * TAU
		var spd = 40.0 + randf() * 110.0
		x = px
		y = py
		vx = cos(ang) * spd
		vy = sin(ang) * spd
		life = 0.35 + randf() * 0.15
		max_life = life
		color = col
		radius = 1.5 + randf() * 2.0

	func update(dt: float) -> void:
		x += vx * dt
		y += vy * dt
		life -= dt


class Floater extends RefCounted:
	var x = 0.0
	var y = 0.0
	var text = ""
	var color = Color.WHITE
	var life = 0.65
	var max_life = 0.65

	func _init(px: float, py: float, label: String, col: Color) -> void:
		x = px
		y = py
		text = label
		color = col

	func update(dt: float) -> void:
		y -= 32.0 * dt
		life -= dt


class Warning extends RefCounted:
	var x = 0.0
	var y = 0.0
	var time = 0.0
	var duration = 2.4
