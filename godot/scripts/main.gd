extends Node

const Data = preload("res://scripts/night_data.gd")
const AudioScript = preload("res://scripts/audio_fx.gd")
const FONT_PATH := "res://assets/fonts/NotoSansTC-Subset.ttf"

const INK := Color("efe6d6")
const MUTED := Color("b7ab9a")
const BLOOD := Color("9e2d3a")
const GOLD := Color("d6b56a")
const MOSS := Color("7dceb0")

var world
var audio
var font: Font
var can_cjk := false
var smoke_hold := false

var root_ui: Control
var hud: Control
var dimmer: ColorRect
var hurt_flash: ColorRect
var warn_flash: ColorRect
var menu_layer: Control
var level_layer: Control
var over_layer: Control
var choice_row: HBoxContainer
var summary_box: GridContainer
var stick: StickLayer
var mute_button: Button
var kills_label: Label
var version_label: Label
var timer_label: Label
var omen_label: Label
var level_label: Label
var hp_bar: Bar
var xp_bar: Bar
var chips := {}

var touch_active := false
var touch_index := -1
var touch_origin := Vector2.ZERO
var touch_vec := Vector2.ZERO
var knob_offset := Vector2.ZERO

var _ui_mode := ""
var _seen_level := 0


func _ready() -> void:
	world = $World
	audio = AudioScript.new()
	add_child(audio)
	world.sfx = Callable(audio, "play")
	_load_font()
	DisplayServer.window_set_title("吸血鬼獵人 — Nightfall")
	_build_ui()
	_apply_mute_label()
	_sync_all()
	if OS.get_cmdline_user_args().has("--shot"):
		smoke_hold = true
		call_deferred("_shot_mode")


func _process(dt: float) -> void:
	var delta := dt
	if delta < 0.0 or is_nan(delta) or is_inf(delta):
		delta = 0.0
	if delta > 0.05:
		delta = 0.05
	if smoke_hold:
		world.visual_tick(delta)
		return
	world.visual_tick(delta)
	if world.state == "playing":
		world.step(delta, _axis())
	_sync_all()


func _unhandled_input(event: InputEvent) -> void:
	if smoke_hold:
		return
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	var code := key.physical_keycode
	if code == KEY_M:
		_toggle_mute()
		get_viewport().set_input_as_handled()
		return
	if world.state == "menu" and (code == KEY_ENTER or code == KEY_KP_ENTER or code == KEY_SPACE):
		_begin()
		get_viewport().set_input_as_handled()
	elif world.state == "levelup" and code >= KEY_1 and code <= KEY_3:
		world.choose_upgrade(code - KEY_1)
		get_viewport().set_input_as_handled()
	elif world.state == "gameover" and (code == KEY_ENTER or code == KEY_KP_ENTER or code == KEY_R):
		_begin()
		get_viewport().set_input_as_handled()


func _input(event: InputEvent) -> void:
	if smoke_hold:
		return
	if world.state != "playing":
		if touch_active:
			_release_touch()
		return
	var sz := get_viewport().get_visible_rect().size
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			if touch_active:
				return
			if touch.position.x > sz.x * 0.52:
				return
			if _touch_blocked(touch.position):
				return
			touch_active = true
			touch_index = touch.index
			touch_origin = _clamp_origin(touch.position, sz)
			_update_touch_vector(touch.position, sz)
		elif touch.index == touch_index:
			_release_touch()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if touch_active and drag.index == touch_index:
			_update_touch_vector(drag.position, sz)


func _begin() -> void:
	world.start()
	_release_touch()
	get_viewport().gui_release_focus()
	_sync_all()


func _toggle_mute() -> void:
	audio.toggle()
	_apply_mute_label()


func _load_font() -> void:
	if ResourceLoader.exists(FONT_PATH):
		font = load(FONT_PATH)
	if font == null:
		font = ThemeDB.fallback_font
		push_warning("Nightfall: bundled CJK font missing; title falls back to Vampire Hunter.")
	can_cjk = font != null and font.has_char(0x5438) and font.has_char(0x8840) and font.has_char(0x9B3C) and font.has_char(0x7375) and font.has_char(0x4EBA)
	if not can_cjk:
		push_warning("Nightfall: font has no CJK glyphs for 吸血鬼獵人; showing Vampire Hunter.")


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	root_ui = Control.new()
	root_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	root_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme := Theme.new()
	if font:
		theme.default_font = font
	theme.default_font_size = 16
	root_ui.theme = theme
	layer.add_child(root_ui)

	var vignette := ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vignette.color = Color.WHITE
	if ResourceLoader.exists("res://assets/shaders/vignette.gdshader"):
		var mat := ShaderMaterial.new()
		mat.shader = load("res://assets/shaders/vignette.gdshader")
		vignette.material = mat
	root_ui.add_child(vignette)

	dimmer = ColorRect.new()
	dimmer.set_anchors_preset(Control.PRESET_FULL_RECT)
	dimmer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dimmer.color = Color(0.024, 0.027, 0.047, 0.62)
	root_ui.add_child(dimmer)

	warn_flash = ColorRect.new()
	warn_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	warn_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	warn_flash.visible = false
	root_ui.add_child(warn_flash)

	hurt_flash = ColorRect.new()
	hurt_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	hurt_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hurt_flash.visible = false
	root_ui.add_child(hurt_flash)

	_build_hud()
	menu_layer = _overlay()
	_build_menu(menu_layer)
	level_layer = _overlay()
	_build_level(level_layer)
	over_layer = _overlay()
	_build_over(over_layer)

	stick = StickLayer.new()
	root_ui.add_child(stick)

	mute_button = Button.new()
	mute_button.focus_mode = Control.FOCUS_NONE
	mute_button.anchor_left = 1.0
	mute_button.anchor_right = 1.0
	mute_button.anchor_top = 0.0
	mute_button.anchor_bottom = 0.0
	mute_button.offset_left = -150
	mute_button.offset_right = -22
	mute_button.offset_top = 54
	mute_button.offset_bottom = 86
	_style_button(mute_button, Color(0.031, 0.024, 0.039, 0.78), INK)
	mute_button.pressed.connect(_toggle_mute)
	root_ui.add_child(mute_button)


func _build_hud() -> void:
	hud = MarginContainer.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_theme_constant_override("margin_left", 22)
	hud.add_theme_constant_override("margin_right", 22)
	hud.add_theme_constant_override("margin_top", 16)
	hud.add_theme_constant_override("margin_bottom", 18)
	root_ui.add_child(hud)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hud.add_child(column)
	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_theme_constant_override("separation", 12)
	column.add_child(top)

	var left := VBoxContainer.new()
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kills_label = _label("0 KILLS", 15, INK)
	version_label = _label("v%s" % Data.VERSION, 11, Color(INK, 0.55))
	left.add_child(kills_label)
	left.add_child(version_label)
	top.add_child(left)

	var center := VBoxContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.custom_minimum_size = Vector2(520, 0)
	center.add_theme_constant_override("separation", 6)
	timer_label = _label("00:00", 32, INK)
	timer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	omen_label = _label("", 13, Color("ffb4a8"))
	omen_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(timer_label)
	center.add_child(omen_label)
	var weapons := HBoxContainer.new()
	weapons.mouse_filter = Control.MOUSE_FILTER_IGNORE
	weapons.alignment = BoxContainer.ALIGNMENT_CENTER
	weapons.add_theme_constant_override("separation", 6)
	center.add_child(weapons)
	chips["stake"] = _chip(weapons, "STAKE ×1")
	chips["censer"] = _chip(weapons, "CENSER")
	chips["pyre"] = _chip(weapons, "PYRE")
	chips["cross"] = _chip(weapons, "CROSS")
	chips["magnet"] = _chip(weapons, "MAGNET 175")
	top.add_child(center)

	level_label = _label("LV 1", 15, INK)
	level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	level_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(level_label)

	var spacer := Control.new()
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(spacer)

	var bars := VBoxContainer.new()
	bars.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bars.add_theme_constant_override("separation", 8)
	column.add_child(bars)
	hp_bar = Bar.new()
	hp_bar.fill = BLOOD
	hp_bar.font_ref = font
	hp_bar.custom_minimum_size = Vector2(0, 22)
	xp_bar = Bar.new()
	xp_bar.fill = MOSS
	xp_bar.font_ref = font
	xp_bar.custom_minimum_size = Vector2(0, 22)
	bars.add_child(hp_bar)
	bars.add_child(xp_bar)


func _build_menu(layer: Control) -> void:
	var panel := _panel(440)
	layer.add_child(panel)
	var box := _panel_box(panel)
	box.add_child(_label("SURVIVORS PROTOTYPE · v%s" % Data.VERSION, 12, GOLD))
	var zh := _label("吸血鬼獵人", 48, INK)
	zh.visible = can_cjk
	box.add_child(zh)
	var fallback := _label("Vampire Hunter", 28, INK)
	fallback.visible = not can_cjk
	box.add_child(fallback)
	var night := _label("Nightfall", 40, INK)
	box.add_child(night)
	var lede := _label("Move through the dark. The stake aims itself. Level up to wake a censer, a pyre, or an ash cross, and to pull gems from farther away. Around the second minute, a warden marks the ground before it strikes.", 16, MUTED)
	lede.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lede.custom_minimum_size = Vector2(380, 0)
	box.add_child(lede)
	var begin := Button.new()
	begin.text = "Begin the night"
	begin.focus_mode = Control.FOCUS_NONE
	begin.custom_minimum_size = Vector2(0, 44)
	_style_button(begin, BLOOD, Color("fff8ef"))
	begin.pressed.connect(_begin)
	box.add_child(begin)
	for line in [
		"WASD or arrows move. On a touch screen, drag the stick.",
		"The stake fires on its own. A censer, a pyre, or an ash cross can join it.",
		"1  2  3 pick a level-up.",
		"M mutes the night.",
		"Enter starts, and restarts after you fall.",
	]:
		box.add_child(_label(line, 14, MUTED))


func _build_level(layer: Control) -> void:
	var panel := _panel(820)
	layer.add_child(panel)
	var box := _panel_box(panel)
	box.add_child(_label("THE NIGHT PAUSES", 12, GOLD))
	box.add_child(_label("Choose a boon", 32, INK))
	choice_row = HBoxContainer.new()
	choice_row.add_theme_constant_override("separation", 14)
	choice_row.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(choice_row)


func _build_over(layer: Control) -> void:
	var panel := _panel(440)
	layer.add_child(panel)
	var box := _panel_box(panel)
	box.add_child(_label("THE NIGHT WINS", 12, GOLD))
	box.add_child(_label("You fell", 32, INK))
	summary_box = GridContainer.new()
	summary_box.columns = 2
	summary_box.add_theme_constant_override("h_separation", 18)
	summary_box.add_theme_constant_override("v_separation", 8)
	box.add_child(summary_box)
	var again := Button.new()
	again.text = "Rise again"
	again.focus_mode = Control.FOCUS_NONE
	again.custom_minimum_size = Vector2(0, 44)
	_style_button(again, BLOOD, Color("fff8ef"))
	again.pressed.connect(_begin)
	box.add_child(again)
	box.add_child(_label("Enter or R", 14, MUTED))


func _sync_all() -> void:
	if world.level_epoch != _seen_level:
		_seen_level = world.level_epoch
		if world.state == "levelup":
			audio.play("level")
			_build_choices()
	if world.state != _ui_mode:
		if world.state == "gameover":
			audio.play("death")
			_build_summary()
		_ui_mode = world.state
		_apply_mode(_ui_mode)
	if hud.visible:
		_refresh_hud()
	_refresh_flashes()
	_refresh_stick()


func _apply_mode(mode: String) -> void:
	hud.visible = mode == "playing" or mode == "levelup"
	menu_layer.visible = mode == "menu"
	level_layer.visible = mode == "levelup"
	over_layer.visible = mode == "gameover"
	dimmer.visible = mode != "playing"


func _refresh_hud() -> void:
	var hunter = world.player
	kills_label.text = "%d KILLS" % world.kills
	timer_label.text = Data.format_time(world.time)
	level_label.text = "LV %d" % hunter.level
	omen_label.text = world.omen
	omen_label.visible = world.omen != ""
	var hp_ratio := 0.0
	if hunter.max_hp > 0:
		hp_ratio = maxf(0.0, hunter.hp) / float(hunter.max_hp)
	hp_bar.ratio = hp_ratio
	hp_bar.fill = Color("ff5d52") if hp_ratio > 0.0 and hp_ratio <= 0.3 else BLOOD
	hp_bar.text = "%d / %d" % [maxi(0, roundi(hunter.hp)), hunter.max_hp]
	hp_bar.queue_redraw()
	var xp_ratio := 0.0
	if hunter.xp_to_next > 0:
		xp_ratio = clampf(hunter.xp / float(hunter.xp_to_next), 0.0, 1.0)
	xp_bar.ratio = xp_ratio
	xp_bar.text = "%d / %d" % [int(floor(hunter.xp)), hunter.xp_to_next]
	xp_bar.queue_redraw()
	_set_chip("stake", "STAKE ×%d" % hunter.projectile_count, false, true, Color(INK, 1))
	if hunter.censer.owned:
		_set_chip("censer", "CENSER ×%d" % hunter.censer.orbs, false, true, Color("d5e6f4"))
	else:
		_set_chip("censer", "CENSER", true, false, INK)
	if hunter.pyre.owned:
		_set_chip("pyre", "PYRE ×%d" % hunter.pyre.charges, false, true, Color("ffd0a8"))
	else:
		_set_chip("pyre", "PYRE", true, false, INK)
	if hunter.cross.owned:
		_set_chip("cross", "CROSS ×%d" % hunter.cross.count, false, true, Color("f4ead8"))
	else:
		_set_chip("cross", "CROSS", true, false, INK)
	_set_chip("magnet", "MAGNET %d" % int(hunter.magnet_radius), false, hunter.magnet_stacks > 0, Color("c8f6e4") if hunter.magnet_stacks > 0 else INK)


func _refresh_flashes() -> void:
	hurt_flash.visible = world.hurt_flash > 0.01
	hurt_flash.color = Color(0.510, 0.071, 0.110, world.hurt_flash)
	if world.elite_state == "warning" and world.elite_warning != null:
		var pulse := 0.5 + 0.5 * sin(world.elite_warning.time * 10.0)
		warn_flash.visible = true
		warn_flash.color = Color(0.471, 0.063, 0.094, 0.06 + pulse * 0.1)
	else:
		warn_flash.visible = false


func _build_choices() -> void:
	for child in choice_row.get_children():
		choice_row.remove_child(child)
		child.free()
	for index in world.current_choices.size():
		var upgrade = world.current_choices[index]
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(220, 168)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.focus_mode = Control.FOCUS_NONE
		card.add_theme_stylebox_override("panel", _choice_style(upgrade.family, false))
		var box := VBoxContainer.new()
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_theme_constant_override("separation", 6)
		card.add_child(box)
		var key := _label(str(index + 1), 12, GOLD)
		var name := _label(upgrade.title, 20, INK)
		var blurb := _label(upgrade.blurb, 14, MUTED)
		blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var detail := _label(upgrade.detail(world.player), 13, MOSS)
		detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		for node in [key, name, blurb, detail]:
			node.mouse_filter = Control.MOUSE_FILTER_IGNORE
			box.add_child(node)
		card.gui_input.connect(_on_card_input.bind(index))
		card.mouse_entered.connect(_hover_card.bind(card, upgrade.family, true))
		card.mouse_exited.connect(_hover_card.bind(card, upgrade.family, false))
		choice_row.add_child(card)


func _on_card_input(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		world.choose_upgrade(index)


func _hover_card(card: PanelContainer, family: String, inside: bool) -> void:
	card.add_theme_stylebox_override("panel", _choice_style(family, inside))


func _build_summary() -> void:
	for child in summary_box.get_children():
		summary_box.remove_child(child)
		child.free()
	var stats: Dictionary = world.over_stats
	var rows := [
		["Survived", Data.format_time(float(stats.get("time", 0.0)))],
		["Level", str(stats.get("level", 1))],
		["Kills", str(stats.get("kills", 0))],
		["Weapons", str(stats.get("weapons", "Stake"))],
	]
	for row in rows:
		var term := _label(row[0], 15, MUTED)
		var desc := _label(row[1], 15, INK)
		summary_box.add_child(term)
		summary_box.add_child(desc)


func _refresh_stick() -> void:
	var sz := get_viewport().get_visible_rect().size
	var coarse := DisplayServer.is_touchscreen_available()
	var show: bool = world.state == "playing" and (coarse or touch_active)
	stick.shown = show
	stick.radius = _max_radius(sz)
	if show and not touch_active:
		touch_origin = _resting_origin(sz)
		knob_offset = Vector2.ZERO
	stick.origin = touch_origin
	stick.knob = knob_offset
	stick.queue_redraw()


func _axis() -> Vector2:
	if _key_held():
		return _key_axis()
	if touch_active:
		return touch_vec
	return Vector2.ZERO


func _key_held() -> bool:
	return (
		Input.is_physical_key_pressed(KEY_A)
		or Input.is_physical_key_pressed(KEY_D)
		or Input.is_physical_key_pressed(KEY_W)
		or Input.is_physical_key_pressed(KEY_S)
		or Input.is_physical_key_pressed(KEY_LEFT)
		or Input.is_physical_key_pressed(KEY_RIGHT)
		or Input.is_physical_key_pressed(KEY_UP)
		or Input.is_physical_key_pressed(KEY_DOWN)
	)


func _key_axis() -> Vector2:
	var x := 0.0
	var y := 0.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		y += 1.0
	if x == 0.0 and y == 0.0:
		return Vector2.ZERO
	return Vector2(x, y).normalized()


func _max_radius(sz: Vector2) -> float:
	return 64.0 if minf(sz.x, sz.y) < 760.0 else 52.0


func _resting_origin(sz: Vector2) -> Vector2:
	var narrow := sz.x < 760.0
	var x := 96.0 if narrow else 112.0
	var y := sz.y - (196.0 if narrow else 172.0)
	return Vector2(maxf(78.0, minf(x, sz.x * 0.36)), maxf(110.0, minf(y, sz.y - 110.0)))


func _clamp_origin(pos: Vector2, sz: Vector2) -> Vector2:
	return Vector2(clampf(pos.x, 48.0, sz.x * 0.48), clampf(pos.y, 48.0, sz.y - 48.0))


func _update_touch_vector(pos: Vector2, sz: Vector2) -> void:
	var dx := pos.x - touch_origin.x
	var dy := pos.y - touch_origin.y
	var max_r := _max_radius(sz)
	var dead := 12.0
	var mag := sqrt(dx * dx + dy * dy)
	if mag <= 0.0:
		touch_vec = Vector2.ZERO
		knob_offset = Vector2.ZERO
		return
	var shown := minf(mag, max_r)
	var nx := dx / mag
	var ny := dy / mag
	knob_offset = Vector2(nx, ny) * shown
	if shown <= dead:
		touch_vec = Vector2.ZERO
	else:
		touch_vec = Vector2(nx, ny) * ((shown - dead) / (max_r - dead))


func _release_touch() -> void:
	touch_active = false
	touch_index = -1
	touch_vec = Vector2.ZERO
	knob_offset = Vector2.ZERO


func _touch_blocked(pos: Vector2) -> bool:
	if mute_button and mute_button.visible and mute_button.get_global_rect().has_point(pos):
		return true
	return false


func _apply_mute_label() -> void:
	if mute_button == null:
		return
	mute_button.text = "MUTED" if audio.muted else "SOUND ON"


func _set_chip(id: String, text: String, locked: bool, armed: bool, color: Color) -> void:
	var chip: PanelContainer = chips[id]
	var label: Label = chip.get_child(0)
	label.text = text
	label.add_theme_color_override("font_color", color)
	chip.modulate = Color(1, 1, 1, 0.4 if locked else (0.55 if id == "magnet" and not armed else 1.0))
	chip.add_theme_stylebox_override("panel", _chip_style(id, locked, armed))


func _overlay() -> CenterContainer:
	var layer := CenterContainer.new()
	layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root_ui.add_child(layer)
	return layer


func _panel(width: float) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(width, 0)
	panel.add_theme_stylebox_override("panel", _panel_style())
	return panel


func _panel_box(panel: PanelContainer) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	return box


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.063, 0.055, 0.086, 0.94)
	style.border_color = Color(GOLD, 0.38)
	style.set_border_width_all(1)
	style.set_content_margin_all(22)
	return style


func _choice_style(family: String, hover: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("231f2b") if hover else Color("1b1822")
	var border := Color(1, 1, 1, 0.14)
	if family == "censer":
		border = Color(0.839, 0.710, 0.416, 0.55)
	elif family == "pyre":
		border = Color(1.0, 0.588, 0.314, 0.6)
	elif family == "cross":
		border = Color(0.925, 0.863, 0.769, 0.6)
	elif family == "magnet":
		border = Color(0.490, 0.808, 0.690, 0.6)
	elif hover:
		border = GOLD
	style.border_color = border
	style.set_border_width_all(1)
	style.set_content_margin_all(14)
	return style


func _chip_style(id: String, locked: bool, armed: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.031, 0.024, 0.039, 0.55)
	var border := Color(INK, 0.28)
	if not locked and id == "censer":
		border = Color(0.745, 0.839, 0.910, 0.7)
	elif not locked and id == "pyre":
		border = Color(1.0, 0.627, 0.353, 0.75)
	elif not locked and id == "cross":
		border = Color(0.925, 0.863, 0.769, 0.8)
	elif id == "magnet" and armed:
		border = Color(0.490, 0.808, 0.690, 0.8)
	style.border_color = border
	style.set_border_width_all(1)
	style.set_content_margin_all(3)
	style.content_margin_left = 8
	style.content_margin_right = 8
	return style


func _style_button(button: Button, bg: Color, fg: Color) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = bg
	normal.set_content_margin_all(8)
	var hover := normal.duplicate()
	hover.bg_color = bg.lightened(0.12)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	button.add_theme_stylebox_override("focus", normal)
	button.add_theme_color_override("font_color", fg)
	button.add_theme_color_override("font_hover_color", fg)
	button.add_theme_color_override("font_pressed_color", fg)


func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _chip(parent: Node, text: String) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_theme_stylebox_override("panel", _chip_style("", true, false))
	var label := _label(text, 11, INK)
	chip.add_child(label)
	parent.add_child(chip)
	return chip


func run_smoke() -> Dictionary:
	var errors: PackedStringArray = []
	var lines: PackedStringArray = []
	smoke_hold = true
	if world == null or world.player == null:
		return {"ok": false, "log": "SMOKE FAIL: world was not ready"}
	lines.append("main scene loaded")
	if world.player.xp_to_next != 40:
		errors.append("level 1 XP is %s, expected 40" % world.player.xp_to_next)
	if absf(world.player.magnet_radius - 175.0) > 0.01 or absf(world.player.pickup_radius - 22.0) > 0.01:
		errors.append("magnet baseline %s / %s" % [world.player.magnet_radius, world.player.pickup_radius])
	world.start()
	if world.state != "playing":
		errors.append("start did not enter play")
	if world.foes.size() < 4:
		errors.append("expected 4 opening foes, saw %d" % world.foes.size())
	else:
		lines.append("enemies spawned %d" % world.foes.size())
	var start_x: float = world.player.x
	for _i in 10:
		world.step(0.05, Vector2.RIGHT)
	var moved: float = world.player.x - start_x
	if moved < 50.0:
		errors.append("player moved only %.1f px" % moved)
	else:
		lines.append("player moved %.1f px" % moved)
	# Isolate one shambler in front of the hunter so the stake's hit is unambiguous.
	var quarry = Data.Foe.new("shambler", world.player.x + 140.0, world.player.y, world.time)
	world.foes = [quarry]
	world.projectiles = []
	world.player.attack_timer = 0.0
	var fired := false
	var guard := 0
	while quarry.hp > 0.0 and guard < 80 and world.state == "playing":
		var before: int = world.projectiles.size()
		world.step(0.05, Vector2.ZERO)
		if world.projectiles.size() > before or world.kills > 0:
			fired = true
		guard += 1
	if not fired:
		errors.append("stake did not fire")
	if world.kills < 1 or quarry.hp > 0.0:
		errors.append("stake did not kill (hp %.1f state %s)" % [quarry.hp, world.state])
	else:
		lines.append("stake kills %d" % world.kills)
	guard = 0
	while world.player.level < 2 and guard < 30 and world.state == "playing":
		world.gems.append(Data.Gem.new(world.player.x, world.player.y, 2))
		world.step(0.05, Vector2.ZERO)
		guard += 1
	if world.player.level < 2 or world.state != "levelup":
		errors.append("XP did not level up (level %d, state %s)" % [world.player.level, world.state])
	else:
		lines.append("xp leveled to %d (%d choices)" % [world.player.level, world.current_choices.size()])
	if world.current_choices.size() != 3:
		errors.append("expected 3 boons, saw %d" % world.current_choices.size())
	var ids := {}
	for choice in world.current_choices:
		ids[choice.id] = true
	for need in ["censer", "pyre", "cross"]:
		if not ids.has(need):
			errors.append("level-up missing pinned %s" % need)
	if ids.has("censer") and ids.has("pyre") and ids.has("cross"):
		lines.append("pinned boons censer, pyre, cross")
	var censer_index := -1
	for i in world.current_choices.size():
		if world.current_choices[i].id == "censer":
			censer_index = i
	if censer_index >= 0:
		world.choose_upgrade(censer_index)
	if not world.player.censer.owned:
		errors.append("censer was not taken")
	guard = 0
	while world.state != "levelup" and guard < 40:
		world.gems.append(Data.Gem.new(world.player.x, world.player.y, 2))
		world.step(0.05, Vector2.ZERO)
		guard += 1
	var second := {}
	for choice in world.current_choices:
		second[choice.id] = true
	if second.has("censer"):
		errors.append("censer stayed pinned after it was taken")
	if not second.has("pyre") or not second.has("cross"):
		errors.append("pyre/cross left the table early")
	else:
		lines.append("censer left the table; pyre and cross stayed")
	if world.state == "levelup" and world.current_choices.size() > 0:
		world.choose_upgrade(0)
	world.player.hp = 100000.0
	world.player.max_hp = 100000
	world.time = 100.0
	world.elite_state = "idle"
	world.elite_warning = null
	guard = 0
	while world.elite_state != "alive" and world.elite_state != "fallen" and guard < 200:
		if world.state == "levelup" and world.current_choices.size() > 0:
			world.choose_upgrade(0)
		if world.state != "playing":
			break
		world.step(0.05, Vector2.ZERO)
		guard += 1
	var warden := false
	for foe in world.foes:
		if foe.type == "warden":
			warden = true
	if not warden:
		errors.append("warden did not arrive (elite %s)" % world.elite_state)
	else:
		lines.append("warden arrived")
	var magnet := Data.Hunter.new(0, 0)
	if not Data.apply_upgrade(magnet, "magnet"):
		errors.append("magnet boon refused")
	if absf(magnet.magnet_radius - 223.0) > 0.01 or absf(magnet.pickup_radius - 22.0) > 0.01:
		errors.append("magnet step %s pickup %s" % [magnet.magnet_radius, magnet.pickup_radius])
	for _i in 5:
		Data.apply_upgrade(magnet, "magnet")
	if absf(magnet.magnet_radius - 320.0) > 0.01:
		errors.append("magnet cap %s" % magnet.magnet_radius)
	else:
		lines.append("magnet 175 → 223 → cap 320, pickup 22")
	if Data.apply_upgrade(magnet, "missing-boon"):
		errors.append("unknown boon applied")
	if Data.xp_required_for(1) != 40 or Data.xp_required_for(2) != 60:
		errors.append("xp curve %s / %s" % [Data.xp_required_for(1), Data.xp_required_for(2)])
	if Data.elite_due(89.9, 999) or not Data.elite_due(90.0, 80) or Data.elite_due(90.0, 79) or not Data.elite_due(100.0, 0):
		errors.append("elite timing drifted")
	world.queue_redraw()
	var log := "\n".join(lines)
	if errors.is_empty():
		return {"ok": true, "log": "SMOKE OK\n" + log}
	return {"ok": false, "log": "SMOKE FAIL\n" + "\n".join(errors) + "\n" + log}


func _shot_mode() -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	_save_viewport("/opt/cursor/artifacts/nightfall-title.png")
	world.start()
	var t := 0.0
	while t < 16.0:
		if world.state == "levelup" and world.current_choices.size() > 0:
			world.choose_upgrade(0)
		if world.state == "gameover":
			break
		world.step(0.05, Vector2(cos(t * 0.85), sin(t * 0.55)))
		t += 0.05
	world.anim = t
	_sync_all()
	world.queue_redraw()
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	_save_viewport("/opt/cursor/artifacts/nightfall-run.png")
	get_tree().quit(0)


func _save_viewport(path: String) -> void:
	var image := get_viewport().get_texture().get_image()
	if image == null or image.is_empty():
		push_warning("Nightfall: viewport image was empty, skipped %s" % path)
		return
	var dir := path.get_base_dir()
	DirAccess.make_dir_recursive_absolute(dir)
	var err := image.save_png(path)
	if err != OK:
		push_warning("Nightfall: could not save %s (%s)" % [path, err])
	else:
		print("saved ", path)


class StickLayer extends Control:
	var origin := Vector2.ZERO
	var knob := Vector2.ZERO
	var shown := false
	var radius := 52.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		if not shown:
			return
		draw_circle(origin, radius, Color(0.031, 0.024, 0.039, 0.42))
		draw_arc(origin, maxf(8.0, radius - 6.0), 0.0, TAU, 40, Color(0.937, 0.902, 0.839, 0.38), 2.0, true)
		var at := origin + knob
		draw_circle(at, 27.0, Color(0.839, 0.710, 0.416, 0.88))
		draw_arc(at, 27.0, 0.0, TAU, 28, Color(1, 0.973, 0.937, 0.78), 2.0, true)


class Bar extends Control:
	var ratio := 0.0
	var fill := Color("9e2d3a")
	var text := ""
	var font_ref: Font

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(0, 22)

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.031, 0.024, 0.039, 0.72))
		draw_rect(Rect2(Vector2.ZERO, Vector2(size.x * clampf(ratio, 0.0, 1.0), size.y)), fill)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.937, 0.902, 0.839, 0.2), false, 1.0)
		var used := font_ref if font_ref != null else ThemeDB.fallback_font
		if used == null or text == "":
			return
		var ts := used.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
		draw_string(used, Vector2((size.x - ts.x) * 0.5, size.y * 0.5 + ts.y * 0.35), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("fff8ef"))
