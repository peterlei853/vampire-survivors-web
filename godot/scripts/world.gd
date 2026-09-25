extends Node2D

const Data = preload("res://scripts/night_data.gd")

var state = "menu"
var player = null
var foes: Array = []
var projectiles: Array = []
var crosses: Array = []
var flasks: Array = []
var pools: Array = []
var gems: Array = []
var particles: Array = []
var floaters: Array = []
var cam_pos = Vector2.ZERO
var time = 0.0
var kills = 0
var pending_levels = 0
var current_choices: Array = []
var spawn_timer = 2.2
var shake = 0.0
var hurt_flash = 0.0
var elite_state = "idle"
var elite_warning = null
var omen = ""
var omen_timer = 0.0
var level_epoch = 0
var over_stats = {}
var anim = 0.0
var view = Vector2(1280, 720)
var sfx = Callable()
var font: Font
var camera: Camera2D


func _ready() -> void:
	camera = $Camera
	camera.position_smoothing_enabled = false
	camera.make_current()
	if ResourceLoader.exists("res://assets/fonts/NotoSansTC-Subset.ttf"):
		font = load("res://assets/fonts/NotoSansTC-Subset.ttf")
	if font == null:
		font = ThemeDB.fallback_font
	reset_world()
	state = "menu"


func reset_world() -> void:
	player = Data.Hunter.new(0.0, 0.0)
	foes = []
	projectiles = []
	crosses = []
	flasks = []
	pools = []
	gems = []
	particles = []
	floaters = []
	cam_pos = Vector2.ZERO
	if camera:
		camera.position = Vector2.ZERO
		camera.offset = Vector2.ZERO
	time = 0.0
	kills = 0
	pending_levels = 0
	current_choices = []
	spawn_timer = 2.2
	shake = 0.0
	hurt_flash = 0.0
	elite_state = "idle"
	elite_warning = null
	omen = ""
	omen_timer = 0.0
	over_stats = {}


func start() -> void:
	reset_world()
	state = "playing"
	_refresh_view()
	for _i in 4:
		_spawn_around("shambler")


func visual_tick(dt: float) -> void:
	_refresh_view()
	anim += dt
	if shake > 0.0:
		shake = maxf(0.0, shake - 34.0 * dt)
	if hurt_flash > 0.0:
		hurt_flash = maxf(0.0, hurt_flash - 1.15 * dt)
	if camera:
		var sx = 0.0
		var sy = 0.0
		if shake > 0.0:
			sx = (randf() - 0.5) * shake
			sy = (randf() - 0.5) * shake
		camera.offset = Vector2(sx, sy)
	queue_redraw()


func step(dt: float, axis: Vector2) -> void:
	if state != "playing" or player == null:
		return
	if dt < 0.0 or is_nan(dt) or is_inf(dt):
		return
	if dt > 0.05:
		dt = 0.05
	_refresh_view()
	time += dt
	_maybe_elite()
	_update_elite(dt)
	player.update(dt, axis)
	_track_aim()
	_prune_far()
	spawn_timer -= dt
	if spawn_timer <= 0.0:
		spawn_timer = Data.spawn_interval_for(time, kills)
		_spawn_batch()
	for foe in foes:
		foe.update(dt, player)
	_separate()
	_try_attack()
	_update_projectiles(dt)
	_update_censer(dt)
	_update_pyre(dt)
	_update_cross(dt)
	_resolve_pulses()
	_reap()
	_update_gems(dt)
	_resolve_contact()
	_update_fx(dt)
	_update_camera(dt)
	_finish_frame()


func choose_upgrade(index: int) -> void:
	if state != "levelup":
		return
	if index < 0 or index >= current_choices.size():
		return
	var upgrade = current_choices[index]
	upgrade.apply_to.call(player)
	pending_levels = maxi(0, pending_levels - 1)
	current_choices = []
	if pending_levels > 0:
		_open_level_up()
		return
	state = "playing"


func apply_upgrade(id: String) -> bool:
	return Data.apply_upgrade(player, id)


func weapon_summary() -> Dictionary:
	var censer = player.censer
	var pyre = player.pyre
	var cross = player.cross
	return {
		"stake": {
			"damage": player.damage,
			"count": player.projectile_count,
			"interval": player.attack_interval,
			"pierce": player.pierce,
		},
		"censer": {
			"owned": censer.owned,
			"orbs": censer.orbs,
			"damage": censer.damage,
			"radius": censer.radius,
		},
		"pyre": {
			"owned": pyre.owned,
			"charges": pyre.charges,
			"damage": pyre.damage,
			"radius": pyre.radius,
			"interval": pyre.interval,
		},
		"cross": {
			"owned": cross.owned,
			"count": cross.count,
			"damage": cross.damage,
			"flight": cross.flight,
			"interval": cross.interval,
		},
		"magnet": {
			"radius": player.magnet_radius,
			"pickup_radius": player.pickup_radius,
			"stacks": player.magnet_stacks,
		},
		"elite": elite_state,
		"threat": Data.night_threat(time, kills),
	}


func _refresh_view() -> void:
	var vp = get_viewport()
	if vp == null:
		return
	var s = vp.get_visible_rect().size
	if s.x >= 2.0 and s.y >= 2.0:
		view = s


func _sfx(kind: String) -> void:
	if sfx.is_valid():
		sfx.call(kind)


func _maybe_elite() -> void:
	if elite_state != "idle":
		return
	if not Data.elite_due(time, kills):
		return
	var ang = randf() * TAU
	var dist = minf(view.x, view.y) * 0.36
	var warn = Data.Warning.new()
	warn.x = player.x + cos(ang) * dist
	warn.y = player.y + sin(ang) * dist
	warn.time = 0.0
	warn.duration = Data.ELITE_WARN
	elite_warning = warn
	elite_state = "warning"
	omen = "The Warden rises"
	omen_timer = 0.0
	shake = 8.0


func _update_elite(dt: float) -> void:
	if elite_state == "warning" and elite_warning != null:
		elite_warning.time += dt
		if elite_warning.time >= elite_warning.duration:
			_spawn_warden()
	if omen_timer > 0.0:
		omen_timer -= dt
		if omen_timer <= 0.0 and elite_state != "warning":
			omen = ""


func _spawn_warden() -> void:
	var spot = elite_warning
	if spot == null or elite_state != "warning":
		return
	foes.append(Data.Foe.new("warden", spot.x, spot.y, time))
	elite_state = "alive"
	omen = "The Warden is here"
	omen_timer = 2.2
	shake = 18.0
	floaters.append(Data.Floater.new(spot.x, spot.y - 46.0, "WARDEN", Color("ffb4a8")))


func _spawn_batch() -> void:
	var count = Data.spawn_count_for(time, kills)
	for _i in count:
		_make_room()
		_spawn_around(_pick_type())


func _make_room() -> void:
	if foes.size() < Data.max_enemies_for(time, kills):
		return
	var far_index = -1
	var far_dist = -1.0
	for i in foes.size():
		var foe = foes[i]
		if foe.type == "warden":
			continue
		var dist = (foe.x - player.x) * (foe.x - player.x) + (foe.y - player.y) * (foe.y - player.y)
		if dist > far_dist:
			far_dist = dist
			far_index = i
	if far_index >= 0:
		foes.remove_at(far_index)


func _pick_type() -> String:
	if time < 32.0:
		return "shambler"
	var brute_chance = 0.0
	if time >= 75.0:
		brute_chance = minf(0.32, (time - 75.0) / 220.0)
	var bat_chance = minf(0.48, (time - 32.0) / 180.0)
	var roll = randf()
	if roll < brute_chance:
		return "brute"
	if roll < brute_chance + bat_chance:
		return "bat"
	return "shambler"


func _spawn_around(type_name: String) -> void:
	var half_w = view.x * 0.5
	var half_h = view.y * 0.5
	var pad = 48.0 + randf() * 80.0
	var side = randi() % 4
	var x = player.x + (randf() - 0.5) * view.x
	var y = player.y + (randf() - 0.5) * view.y
	if side == 0:
		y = player.y - half_h - pad
	elif side == 1:
		y = player.y + half_h + pad
	elif side == 2:
		x = player.x - half_w - pad
	else:
		x = player.x + half_w + pad
	foes.append(Data.Foe.new(type_name, x, y, time))


func _prune_far() -> void:
	var limit = maxf(1200.0, sqrt(view.x * view.x + view.y * view.y) * 0.95)
	var limit2 = limit * limit
	var kept: Array = []
	for foe in foes:
		if foe.type == "warden":
			kept.append(foe)
			continue
		var dx = foe.x - player.x
		var dy = foe.y - player.y
		if dx * dx + dy * dy <= limit2:
			kept.append(foe)
	foes = kept


func _track_aim() -> void:
	var best = null
	var best_dist = INF
	for foe in foes:
		var dx = foe.x - player.x
		var dy = foe.y - player.y
		var dist = dx * dx + dy * dy
		if dist < best_dist:
			best_dist = dist
			best = foe
	if best != null:
		player.aim = atan2(best.y - player.y, best.x - player.x)


func _try_attack() -> void:
	if player.attack_timer > 0.0 or foes.is_empty():
		return
	var targets = _nearest(player.x, player.y, foes, player.projectile_count)
	if targets.is_empty():
		return
	player.attack_timer = player.attack_interval
	player.aim = atan2(targets[0].y - player.y, targets[0].x - player.x)
	var groups: Array = []
	groups.resize(targets.size())
	for i in groups.size():
		groups[i] = []
	for i in player.projectile_count:
		groups[i % targets.size()].append(i)
	for index in groups.size():
		var shots: Array = groups[index]
		if shots.is_empty():
			continue
		var target = targets[index]
		var base = atan2(target.y - player.y, target.x - player.x)
		var mid = (shots.size() - 1) / 2.0
		for n in shots.size():
			var angle = base + (float(n) - mid) * 0.22
			projectiles.append(Data.Stake.new(
				player.x + cos(angle) * (player.radius + 6.0),
				player.y + sin(angle) * (player.radius + 6.0),
				cos(angle) * player.projectile_speed,
				sin(angle) * player.projectile_speed,
				player.damage,
				player.pierce,
				player.projectile_life
			))


func _update_projectiles(dt: float) -> void:
	var kept: Array = []
	for shot in projectiles:
		shot.update(dt)
		if shot.life <= 0.0:
			continue
		for foe in foes:
			if shot.hits_left <= 0:
				break
			if shot.hit_ids.has(foe.id) or foe.hp <= 0.0:
				continue
			var dx = shot.x - foe.x
			var dy = shot.y - foe.y
			var dist = sqrt(dx * dx + dy * dy)
			if dist > shot.radius + foe.radius:
				continue
			foe.hp -= shot.damage
			foe.hit_flash = 0.09
			var nx = (foe.x - shot.x) / (dist if dist != 0.0 else 1.0)
			var ny = (foe.y - shot.y) / (dist if dist != 0.0 else 1.0)
			foe.x += nx * 7.0
			foe.y += ny * 7.0
			shot.hit_ids[foe.id] = true
			shot.hits_left -= 1
			_sfx("hit")
			floaters.append(Data.Floater.new(foe.x, foe.y - foe.radius, str(shot.damage), Color("fff1c2")))
		if shot.hits_left > 0 and shot.life > 0.0:
			kept.append(shot)
	projectiles = kept


func _update_censer(dt: float) -> void:
	var censer = player.censer
	censer.advance(dt)
	if not censer.owned:
		return
	var spokes: Array = censer.spokes(player)
	for foe in foes:
		if foe.hp <= 0.0 or foe.censer_cd > 0.0:
			continue
		if not censer.touches(foe, spokes):
			continue
		foe.hp -= censer.damage
		foe.hit_flash = 0.09
		foe.censer_cd = censer.hit_cooldown
		_sfx("hit")
		floaters.append(Data.Floater.new(foe.x, foe.y - foe.radius, str(censer.damage), Color("d7e8f8")))


func _update_pyre(dt: float) -> void:
	var pyre = player.pyre
	if pyre.owned and pyre.timer > 0.0:
		pyre.timer = maxf(0.0, pyre.timer - dt)
	if pyre.owned and pyre.timer <= 0.0:
		var living: Array = []
		for foe in foes:
			if foe.hp > 0.0:
				living.append(foe)
		if living.size() > 0:
			pyre.timer = pyre.interval
			var targets = _nearest(player.x, player.y, living, pyre.charges)
			var spec = {
				"radius": pyre.radius,
				"damage": pyre.damage,
				"duration": pyre.duration,
				"tick": pyre.tick,
			}
			for foe in targets:
				flasks.append(Data.Flask.new(player.x, player.y, foe.x, foe.y, spec))
	var flying: Array = []
	for flask in flasks:
		flask.update(dt)
		if flask.done():
			var spec: Dictionary = flask.spec
			pools.append(Data.Pool.new(flask.tx, flask.ty, float(spec["radius"]), int(spec["damage"]), float(spec["duration"]), float(spec["tick"])))
		else:
			flying.append(flask)
	flasks = flying
	var burning: Array = []
	for pool in pools:
		pool.update(dt)
		if pool.life <= 0.0:
			continue
		for foe in foes:
			if foe.hp <= 0.0 or not pool.ready_for(foe):
				continue
			var reach = pool.radius + foe.radius * 0.15
			var dx = foe.x - pool.x
			var dy = foe.y - pool.y
			if sqrt(dx * dx + dy * dy) > reach:
				continue
			foe.hp -= pool.damage
			foe.hit_flash = 0.08
			pool.mark(foe)
			_sfx("hit")
			floaters.append(Data.Floater.new(foe.x, foe.y - foe.radius, str(pool.damage), Color("ffc48a")))
		burning.append(pool)
	pools = burning
	if pools.size() > 24:
		pools = pools.slice(pools.size() - 24)


func _update_cross(dt: float) -> void:
	var cross = player.cross
	if cross.owned and cross.timer > 0.0:
		cross.timer = maxf(0.0, cross.timer - dt)
	if cross.owned and cross.timer <= 0.0:
		cross.timer = cross.interval
		var living: Array = []
		for foe in foes:
			if foe.hp > 0.0:
				living.append(foe)
		var base = player.aim
		if living.size() > 0:
			var target = _nearest(player.x, player.y, living, 1)[0]
			base = atan2(target.y - player.y, target.x - player.x)
		var count: int = cross.count
		var mid = (count - 1) / 2.0
		for i in count:
			var angle = base + (float(i) - mid) * 0.5
			crosses.append(Data.Bolt.new(
				player.x + cos(angle) * (player.radius + 8.0),
				player.y + sin(angle) * (player.radius + 8.0),
				angle,
				cross.damage,
				cross.speed,
				cross.flight
			))
	var kept: Array = []
	for bolt in crosses:
		if not bolt.update(dt, player):
			continue
		for foe in foes:
			if foe.hp <= 0.0 or not bolt.ready_for(foe):
				continue
			var dx = bolt.x - foe.x
			var dy = bolt.y - foe.y
			if sqrt(dx * dx + dy * dy) > bolt.radius + foe.radius:
				continue
			foe.hp -= bolt.damage
			foe.hit_flash = 0.09
			bolt.mark(foe)
			_sfx("hit")
			floaters.append(Data.Floater.new(foe.x, foe.y - foe.radius, str(bolt.damage), Color("f0e2cc")))
		kept.append(bolt)
	crosses = kept
	if crosses.size() > 16:
		crosses = crosses.slice(crosses.size() - 16)


func _resolve_pulses() -> void:
	for foe in foes:
		var pulse = foe.pulse
		if pulse == null:
			continue
		foe.pulse = null
		var dx = player.x - pulse.x
		var dy = player.y - pulse.y
		var dist = sqrt(dx * dx + dy * dy)
		if dist > pulse.radius + player.radius or player.invuln > 0.0:
			continue
		_hurt(int(pulse.damage))


func _hurt(amount: int) -> void:
	player.hp -= amount
	player.invuln = 0.72
	shake = maxf(shake, 12.0)
	hurt_flash = 0.4
	floaters.append(Data.Floater.new(player.x, player.y - 20.0, "-%d" % amount, Color("ff9a92")))
	_sfx("hurt")


func _reap() -> void:
	var alive: Array = []
	for foe in foes:
		if foe.hp > 0.0:
			alive.append(foe)
			continue
		kills += 1
		if foe.type == "warden":
			elite_state = "fallen"
			omen = "The Warden falls"
			omen_timer = 2.4
			_drop_hoard(foe)
		else:
			gems.append(Data.Gem.new(foe.x, foe.y, foe.xp))
		var spark_count = 18 if foe.type == "warden" else 7
		for i in spark_count:
			var color: Color = foe.color
			if foe.type == "warden" and i % 2 == 0:
				color = Color("f2e2a0")
			particles.append(Data.Spark.new(foe.x, foe.y, color))
	foes = alive
	_trim_gems()


func _trim_gems() -> void:
	if gems.size() <= 180:
		return
	var px = player.x
	var py = player.y
	gems.sort_custom(func(a, b):
		var da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py)
		var db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py)
		return da < db
	)
	gems.resize(180)


func _drop_hoard(foe) -> void:
	gems.append(Data.Gem.new(foe.x, foe.y, 30))
	for i in 6:
		var angle = (float(i) / 6.0) * TAU
		gems.append(Data.Gem.new(foe.x + cos(angle) * 24.0, foe.y + sin(angle) * 24.0, 5))


func _update_gems(dt: float) -> void:
	var kept: Array = []
	for gem in gems:
		gem.update(dt, player)
		if gem.collected_by(player):
			_sfx("gem")
			pending_levels += player.gain_xp(gem.value).size()
		else:
			kept.append(gem)
	gems = kept


func _resolve_contact() -> void:
	for foe in foes:
		var dx = player.x - foe.x
		var dy = player.y - foe.y
		var dist = sqrt(dx * dx + dy * dy)
		var min_d = player.radius + foe.radius * 0.82
		if dist == 0.0:
			dx = 1.0
			dy = 0.0
			dist = 1.0
		if dist >= min_d:
			continue
		var overlap = min_d - dist
		var nx = dx / dist
		var ny = dy / dist
		player.x += nx * overlap * 0.8
		player.y += ny * overlap * 0.8
		foe.x -= nx * overlap * 0.45
		foe.y -= ny * overlap * 0.45
		if player.invuln <= 0.0:
			_hurt(foe.damage)


func _separate() -> void:
	for i in foes.size():
		for j in range(i + 1, foes.size()):
			var a = foes[i]
			var b = foes[j]
			var dx = b.x - a.x
			var dy = b.y - a.y
			var dist = sqrt(dx * dx + dy * dy)
			var min_d = (a.radius + b.radius) * 0.85
			if dist == 0.0:
				dx = 1.0
				dy = 0.0
				dist = 1.0
			if dist >= min_d:
				continue
			var push = (min_d - dist) / 2.0
			var nx = dx / dist
			var ny = dy / dist
			a.x -= nx * push
			a.y -= ny * push
			b.x += nx * push
			b.y += ny * push


func _update_fx(dt: float) -> void:
	var sparks: Array = []
	for spark in particles:
		spark.update(dt)
		if spark.life > 0.0:
			sparks.append(spark)
	particles = sparks
	var notes: Array = []
	for popup in floaters:
		popup.update(dt)
		if popup.life > 0.0:
			notes.append(popup)
	floaters = notes
	if particles.size() > 240:
		particles = particles.slice(particles.size() - 240)
	if floaters.size() > 48:
		floaters = floaters.slice(floaters.size() - 48)


func _update_camera(dt: float) -> void:
	var k = minf(1.0, dt * 9.0)
	cam_pos.x += (player.x - cam_pos.x) * k
	cam_pos.y += (player.y - cam_pos.y) * k
	if camera:
		camera.position = cam_pos


func _finish_frame() -> void:
	if player.hp <= 0.0:
		_enter_game_over()
		return
	if pending_levels > 0 and state == "playing":
		_open_level_up()


func _open_level_up() -> void:
	current_choices = Data.roll_upgrades(player, 3)
	if current_choices.is_empty():
		pending_levels = 0
		state = "playing"
		return
	state = "levelup"
	level_epoch += 1


func _enter_game_over() -> void:
	if state == "gameover":
		return
	state = "gameover"
	player.hp = 0.0
	pending_levels = 0
	current_choices = []
	over_stats = {
		"time": time,
		"level": player.level,
		"kills": kills,
		"weapons": _weapon_line(),
	}


func _weapon_line() -> String:
	var parts: PackedStringArray = PackedStringArray(["Stake"])
	if player.censer.owned:
		parts.append("Censer ×%d" % player.censer.orbs)
	if player.pyre.owned:
		parts.append("Pyre ×%d" % player.pyre.charges)
	if player.cross.owned:
		parts.append("Cross ×%d" % player.cross.count)
	return " · ".join(parts)


func _nearest(origin_x: float, origin_y: float, list: Array, count: int) -> Array:
	var scored: Array = []
	for foe in list:
		var dx = foe.x - origin_x
		var dy = foe.y - origin_y
		scored.append({"foe": foe, "d": dx * dx + dy * dy})
	scored.sort_custom(func(a, b): return a.d < b.d)
	var out: Array = []
	var n = mini(count, scored.size())
	for i in n:
		out.append(scored[i].foe)
	return out


func _draw() -> void:
	if player == null:
		return
	_refresh_view()
	var cam = cam_pos
	if camera:
		cam = camera.position
	var extra = 12.0
	draw_rect(Rect2(cam - view * 0.5 - Vector2(extra, extra), view + Vector2(extra * 2.0, extra * 2.0)), Color("10141c"))
	_draw_ground(cam)
	for pool in pools:
		_draw_pool(pool)
	_draw_warning()
	_draw_marks()
	_draw_magnet()
	for gem in gems:
		_draw_gem(gem)
	for spark in particles:
		_draw_spark(spark)
	var actors: Array = foes.duplicate()
	actors.append(player)
	actors.sort_custom(func(a, b): return a.y < b.y)
	for actor in actors:
		if actor == player:
			_draw_hunter()
		elif actor.type == "warden":
			_draw_warden(actor)
		else:
			_draw_foe(actor)
	_draw_censer()
	for flask in flasks:
		_draw_flask(flask)
	for shot in projectiles:
		_draw_stake(shot)
	for bolt in crosses:
		_draw_bolt(bolt)
	for popup in floaters:
		_draw_popup(popup)


func _draw_ground(cam: Vector2) -> void:
	var spacing = 64.0
	var start_x = floori((cam.x - view.x * 0.5) / spacing) * spacing
	var start_y = floori((cam.y - view.y * 0.5) / spacing) * spacing
	var end_x = cam.x + view.x * 0.5 + spacing
	var end_y = cam.y + view.y * 0.5 + spacing
	var guard = 0
	var x = start_x
	while x < end_x and guard < 4000:
		var y = start_y
		while y < end_y and guard < 4000:
			guard += 1
			var n = Data.hash01(int(round(x / spacing)), int(round(y / spacing)))
			draw_rect(Rect2(x, y, 2, 2), Color(0.745, 0.776, 0.690, 0.045))
			if n > 0.84:
				var col = Color("2a3830") if n > 0.94 else Color("1a2622")
				_ellipse(Vector2(x + 18.0, y + 14.0), 8.0 + n * 8.0, 3.5 + n * 2.0, col)
			y += spacing
		x += spacing


func _draw_warning() -> void:
	if elite_state != "warning" or elite_warning == null:
		return
	var warn = elite_warning
	var t = clampf(warn.time / warn.duration, 0.0, 1.0)
	var pulse = 0.5 + 0.5 * sin(warn.time * 14.0)
	draw_circle(Vector2(warn.x, warn.y), 18.0 + t * 40.0, Color(0.47, 0.047, 0.094, 0.18 + t * 0.28))
	draw_arc(Vector2(warn.x, warn.y), 26.0 + t * 30.0, 0.0, TAU, 40, Color(1.0, 0.282, 0.22, 0.35 + pulse * 0.5), 3.0, true)
	draw_line(Vector2(warn.x - 16.0, warn.y), Vector2(warn.x + 16.0, warn.y), Color(1.0, 0.824, 0.706, 0.3 + t * 0.4), 2.0, true)
	draw_line(Vector2(warn.x, warn.y - 16.0), Vector2(warn.x, warn.y + 16.0), Color(1.0, 0.824, 0.706, 0.3 + t * 0.4), 2.0, true)


func _draw_marks() -> void:
	for foe in foes:
		if foe.type != "warden" or foe.mark == null:
			continue
		var mark = foe.mark
		var winding = foe.phase == "windup" and foe.windup_max > 0.0
		var t = 1.0
		if winding:
			t = 1.0 - foe.windup / foe.windup_max
		var shown = mark.radius * (maxf(0.2, t) if winding else 1.0)
		var fill = Color(0.627, 0.063, 0.110, 0.08 + 0.22 * t) if winding else Color(1.0, 0.706, 0.471, 0.28)
		draw_circle(Vector2(mark.x, mark.y), shown, fill)
		var stroke = Color(1.0, 0.275, 0.212, 0.4 + 0.55 * t) if winding else Color(1.0, 0.886, 0.745, 0.9)
		draw_arc(Vector2(mark.x, mark.y), mark.radius, 0.0, TAU, 48, stroke, (2.0 + t * 3.0) if winding else 4.0, true)


func _draw_magnet() -> void:
	if player.magnet_stacks <= 0:
		return
	_dashed_circle(Vector2(player.x, player.y), player.magnet_radius, 5.0, 8.0, Color(0.490, 0.808, 0.690, 0.38), 1.5)


func _draw_gem(gem) -> void:
	var bob = sin(gem.bob) * 2.0
	var at = Vector2(gem.x, gem.y + bob)
	if gem.rich:
		draw_circle(at, gem.size, Color(1.0, 0.839, 0.471, 0.28))
	draw_set_transform(at, PI / 4.0, Vector2.ONE)
	draw_rect(Rect2(-gem.size * 0.5 + 2.0, -gem.size * 0.5 + 4.0, gem.size, gem.size), Color(0, 0, 0, 0.25))
	draw_rect(Rect2(-gem.size * 0.5, -gem.size * 0.5, gem.size, gem.size), gem.color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_spark(spark) -> void:
	var col: Color = spark.color
	col.a = maxf(0.0, spark.life / spark.max_life)
	draw_rect(Rect2(spark.x, spark.y, spark.radius, spark.radius), col)


func _draw_hunter() -> void:
	var alpha = 1.0
	if player.hp <= 0.0:
		alpha = 0.45
	elif player.invuln > 0.0:
		alpha = 0.45 + 0.4 * sin(anim * 30.0)
	var at = Vector2(player.x, player.y)
	_ellipse(at + Vector2(0, 12), 12, 5, Color(0, 0, 0, 0.35 * alpha))
	var cloak = PackedVector2Array([
		_rot(Vector2(2, 0), player.aim) + at,
		_rot(Vector2(-16, 12), player.aim) + at,
		_rot(Vector2(-9, 0), player.aim) + at,
		_rot(Vector2(-16, -12), player.aim) + at,
	])
	draw_colored_polygon(cloak, Color(0.431, 0.133, 0.200, alpha))
	var stake_a = _rot(Vector2(8, -1.6), player.aim) + at
	var stake_b = _rot(Vector2(21, -1.6), player.aim) + at
	var stake_c = _rot(Vector2(21, 1.6), player.aim) + at
	var stake_d = _rot(Vector2(8, 1.6), player.aim) + at
	draw_colored_polygon(PackedVector2Array([stake_a, stake_b, stake_c, stake_d]), Color(0.925, 0.851, 0.643, alpha))
	var tip = PackedVector2Array([
		_rot(Vector2(24, 0), player.aim) + at,
		_rot(Vector2(17, -4), player.aim) + at,
		_rot(Vector2(17, 4), player.aim) + at,
	])
	draw_colored_polygon(tip, Color(0.965, 0.953, 0.918, alpha))
	draw_circle(at, 10.0, Color(0.906, 0.847, 0.769, alpha))
	draw_arc(at, 10.0, 0.0, TAU, 24, Color(0.141, 0.110, 0.118, alpha), 2.0, true)
	var eye = Vector2(cos(player.aim), sin(player.aim)) * 2.4
	draw_circle(at + eye + Vector2(-3, -1), 1.5, Color(0.102, 0.071, 0.078, alpha))
	draw_circle(at + eye + Vector2(3, -1), 1.5, Color(0.102, 0.071, 0.078, alpha))


func _draw_foe(foe) -> void:
	var flash = foe.hit_flash > 0.0
	var at = Vector2(foe.x, foe.y)
	_ellipse(at + Vector2(0, foe.radius * 0.75), foe.radius * 0.8, 4.5, Color(0, 0, 0, 0.32))
	if foe.type == "bat":
		var flap = sin(anim * 16.0 + float(foe.id)) * 5.0
		var wing = Color("f4f1ea") if flash else Color("3c2554")
		_ellipse(at + Vector2(-foe.radius, flap), foe.radius * 0.85, 3.5, wing)
		_ellipse(at + Vector2(foe.radius, -flap), foe.radius * 0.85, 3.5, wing)
	if foe.type == "brute":
		var horn = Color("f4f1ea") if flash else Color("3d181c")
		draw_colored_polygon(PackedVector2Array([
			at + Vector2(-6, -foe.radius + 4),
			at + Vector2(-12, -foe.radius - 8),
			at + Vector2(-1, -foe.radius + 2),
		]), horn)
		draw_colored_polygon(PackedVector2Array([
			at + Vector2(6, -foe.radius + 4),
			at + Vector2(12, -foe.radius - 8),
			at + Vector2(1, -foe.radius + 2),
		]), horn)
	var body: Color = Color("f7f3ea") if flash else foe.color
	draw_circle(at, foe.radius, body)
	draw_arc(at, foe.radius, 0.0, TAU, 24, Color(0, 0, 0, 0.35), 2.0, true)
	var eye_r = 2.4 if foe.type == "brute" else 1.7
	draw_circle(at + Vector2(-4, -2), eye_r, Color("140c0c"))
	draw_circle(at + Vector2(4, -2), eye_r, Color("140c0c"))
	if foe.hp < foe.max_hp:
		_hp_bar(at.x, at.y - foe.radius - 8.0, foe.radius * 2.0, 3.0, foe.hp / float(foe.max_hp), Color("e15b55"))


func _draw_warden(foe) -> void:
	var flash = foe.hit_flash > 0.0
	var pulse = 0.85 + sin(anim * 4.0) * 0.15
	var at = Vector2(foe.x, foe.y)
	_ellipse(at + Vector2(0, foe.radius * 0.85), foe.radius, 6.0, Color(0, 0, 0, 0.4))
	_ellipse(at + Vector2(0, 6), foe.radius * 0.95, foe.radius * 1.02, Color("f4f1ea") if flash else Color("2a1018"))
	draw_circle(at + Vector2(0, -2), foe.radius * 0.72, Color("f7f3ea") if flash else foe.color)
	draw_arc(at + Vector2(0, -2), foe.radius * 0.72, 0.0, TAU, 28, Color(0, 0, 0, 0.45), 2.0, true)
	var crown = Color(1, 0.965, 0.894, 1) if flash else Color(0.902, 0.765, 0.416, pulse)
	var r = foe.radius
	# The crown is a concave zigzag. Draw it as separate triangles so the
	# canvas triangulator does not reject the outline.
	var peaks = [
		[Vector2(-14, -r * 0.5), Vector2(-10, -r - 6), Vector2(-4, -r * 0.28)],
		[Vector2(-4, -r * 0.28), Vector2(0, -r - 12), Vector2(4, -r * 0.28)],
		[Vector2(4, -r * 0.28), Vector2(10, -r - 6), Vector2(14, -r * 0.5)],
	]
	for tri in peaks:
		draw_colored_polygon(PackedVector2Array([at + tri[0], at + tri[1], at + tri[2]]), crown)
	draw_circle(at + Vector2(-5, -4), 2.2, Color("140c0c"))
	draw_circle(at + Vector2(5, -4), 2.2, Color("140c0c"))
	_centered_text("WARDEN", at + Vector2(0, -foe.radius - 20.0), 11, Color("ffd2cc"))
	_hp_bar(at.x, at.y - foe.radius - 12.0, foe.radius * 2.4, 5.0, foe.hp / float(foe.max_hp), Color("e6c36a"))


func _draw_censer() -> void:
	var censer = player.censer
	if not censer.owned:
		return
	var spokes: Array = censer.spokes(player)
	draw_arc(Vector2(player.x, player.y), censer.radius, 0.0, TAU, 48, Color(0.776, 0.839, 0.910, 0.16), 1.25, true)
	for i in spokes.size():
		var spoke = spokes[i]
		var trail = spoke.angle - 0.22
		var pulse = 0.9 + sin(anim * 7.0 + float(i)) * 0.1
		var inner = Vector2(player.x, player.y) + Vector2(cos(trail), sin(trail)) * censer.inner
		var outer = Vector2(player.x, player.y) + Vector2(cos(trail), sin(trail)) * censer.radius * 0.92
		draw_line(inner, outer, Color(0.839, 0.886, 0.941, 0.28), 14.0, true)
		draw_line(Vector2(spoke.x0, spoke.y0), Vector2(spoke.x1, spoke.y1), Color(0.910, 0.941, 0.973, 0.72), 4.0, true)
		draw_circle(Vector2(spoke.x1, spoke.y1), 16.0 * pulse, Color(0.839, 0.886, 0.941, 0.2))
		draw_circle(Vector2(spoke.x1, spoke.y1), 8.0 * pulse, Color("d5e2f0"))
		draw_circle(Vector2(spoke.x1, spoke.y1), 3.4, Color("f4e2b8"))


func _draw_flask(flask) -> void:
	var at = Vector2(flask.x, flask.y)
	draw_set_transform(at, PI / 4.0, Vector2.ONE)
	draw_rect(Rect2(-4, -4, 8, 8), Color("ffb15a"))
	draw_rect(Rect2(-2, -2, 4, 4), Color("fff1c9"))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_stake(shot) -> void:
	var angle = atan2(shot.vy, shot.vx)
	var at = Vector2(shot.x, shot.y)
	draw_colored_polygon(PackedVector2Array([
		_rot(Vector2(-16, -2), angle) + at,
		_rot(Vector2(-2, -2), angle) + at,
		_rot(Vector2(-2, 2), angle) + at,
		_rot(Vector2(-16, 2), angle) + at,
	]), Color(1.0, 0.839, 0.549, 0.35))
	draw_colored_polygon(PackedVector2Array([
		_rot(Vector2(-6, -2), angle) + at,
		_rot(Vector2(8, -2), angle) + at,
		_rot(Vector2(8, 2), angle) + at,
		_rot(Vector2(-6, 2), angle) + at,
	]), Color("ffe7a8"))
	draw_colored_polygon(PackedVector2Array([
		_rot(Vector2(12, 0), angle) + at,
		_rot(Vector2(6, -3.5), angle) + at,
		_rot(Vector2(6, 3.5), angle) + at,
	]), Color("fff8e4"))


func _draw_bolt(bolt) -> void:
	var at = Vector2(bolt.x, bolt.y)
	draw_line(at, at - Vector2(cos(bolt.angle), sin(bolt.angle)) * 18.0, Color(0.910, 0.824, 0.706, 0.32), 2.0, true)
	var arm = 13.0
	var horiz_a = _rot(Vector2(-arm, 0), bolt.spin) + at
	var horiz_b = _rot(Vector2(arm, 0), bolt.spin) + at
	var vert_a = _rot(Vector2(0, -arm), bolt.spin) + at
	var vert_b = _rot(Vector2(0, arm), bolt.spin) + at
	draw_line(horiz_a, horiz_b, Color(0.353, 0.306, 0.251, 0.85), 7.0, true)
	draw_line(vert_a, vert_b, Color(0.353, 0.306, 0.251, 0.85), 7.0, true)
	draw_line(horiz_a, horiz_b, Color("f3ead8"), 3.0, true)
	draw_line(vert_a, vert_b, Color("f3ead8"), 3.0, true)
	draw_rect(Rect2(at.x - 2.4, at.y - 2.4, 4.8, 4.8), Color("e7a36a"))


func _draw_pool(pool) -> void:
	var fade = maxf(0.0, pool.life / pool.max_life)
	var breathe = 0.92 + sin(anim * 8.0) * 0.06
	var at = Vector2(pool.x, pool.y + 4.0)
	_ellipse(at, pool.radius * breathe, pool.radius * 0.52 * breathe, Color(1.0, 0.306, 0.125, 0.18 * fade))
	_ellipse_stroke(at, pool.radius * 0.78 * breathe, pool.radius * 0.4, Color(1.0, 0.729, 0.376, 0.55 * fade), 2.0)
	_ellipse(at, pool.radius * 0.28, pool.radius * 0.14, Color(1.0, 0.863, 0.627, 0.4 * fade))


func _draw_popup(popup) -> void:
	var col: Color = popup.color
	col.a = maxf(0.0, popup.life / popup.max_life)
	_centered_text(popup.text, Vector2(popup.x, popup.y), 14, col)


func _hp_bar(cx: float, y: float, width: float, height: float, ratio: float, fill: Color) -> void:
	var x = cx - width * 0.5
	draw_rect(Rect2(x, y, width, height), Color(0, 0, 0, 0.55))
	draw_rect(Rect2(x, y, width * clampf(ratio, 0.0, 1.0), height), fill)


func _centered_text(text: String, at: Vector2, size: int, color: Color) -> void:
	if font == null or text == "":
		return
	var ts = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size)
	draw_string(font, Vector2(at.x - ts.x * 0.5, at.y), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


func _ellipse(center: Vector2, rx: float, ry: float, color: Color) -> void:
	if rx <= 0.01 or ry <= 0.01:
		return
	draw_set_transform(center, 0.0, Vector2(rx, ry))
	draw_circle(Vector2.ZERO, 1.0, color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _ellipse_stroke(center: Vector2, rx: float, ry: float, color: Color, width: float) -> void:
	var pts = PackedVector2Array()
	var samples = 28
	for i in samples + 1:
		var a = TAU * float(i) / float(samples)
		pts.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	draw_polyline(pts, color, width, true)


func _dashed_circle(center: Vector2, radius: float, dash: float, gap: float, color: Color, width: float) -> void:
	if radius <= 1.0:
		return
	var a = 0.0
	var step = (dash + gap) / radius
	var sweep = dash / radius
	while a < TAU:
		var a2 = minf(a + sweep, TAU)
		draw_arc(center, radius, a, a2, 6, color, width, true)
		a += step


func _rot(v: Vector2, angle: float) -> Vector2:
	var c = cos(angle)
	var s = sin(angle)
	return Vector2(v.x * c - v.y * s, v.x * s + v.y * c)
