extends Node

## Short generated cues. Frequencies follow the web AudioBus. Silent when muted or headless.

var muted := false
var players: Array = []
var streams := {}
var last_hit := -1.0
var last_gem := -1.0
const SAVE_PATH := "user://nightfall.cfg"


func _ready() -> void:
	muted = _read_muted()
	for _i in 8:
		var player := AudioStreamPlayer.new()
		player.volume_db = 0.0
		add_child(player)
		players.append(player)
	streams = _build_streams()


func toggle() -> bool:
	set_muted(not muted)
	return muted


func set_muted(next: bool) -> void:
	muted = next
	_write_muted(muted)


func play(kind: String) -> void:
	if muted or streams.is_empty():
		return
	if DisplayServer.get_name() == "headless":
		return
	var now := Time.get_ticks_msec() / 1000.0
	if kind == "hit":
		if now - last_hit < 0.07:
			return
		last_hit = now
	elif kind == "gem":
		if now - last_gem < 0.05:
			return
		last_gem = now
	var stream = streams.get(kind)
	if stream == null:
		return
	for player in players:
		if not player.playing:
			player.stream = stream
			player.play()
			return
	players[0].stream = stream
	players[0].play()


func _build_streams() -> Dictionary:
	return {
		"hit": _wav(_tone(220.0, 90.0, 0.045, "square", 0.22)),
		"hurt": _wav(_tone(130.0, 48.0, 0.14, "square", 0.28)),
		"gem": _wav(_tone(760.0, 1180.0, 0.07, "sine", 0.18)),
		"level": _wav(_level()),
		"death": _wav(_tone(196.0, 52.0, 0.55, "sawtooth", 0.22)),
	}


func _level() -> PackedFloat32Array:
	var rate := 22050
	var total := int(0.40 * rate)
	var mix := PackedFloat32Array()
	mix.resize(total)
	_mix(mix, _tone(523.0, 523.0, 0.08, "triangle", 0.2), 0)
	_mix(mix, _tone(659.0, 659.0, 0.08, "triangle", 0.2), int(0.09 * rate))
	_mix(mix, _tone(784.0, 1046.0, 0.16, "triangle", 0.22), int(0.18 * rate))
	return mix


func _mix(into: PackedFloat32Array, part: PackedFloat32Array, offset: int) -> void:
	for i in part.size():
		var at := offset + i
		if at >= into.size():
			break
		into[at] = clampf(into[at] + part[i], -1.0, 1.0)


func _tone(from_hz: float, to_hz: float, dur: float, wave: String, gain: float) -> PackedFloat32Array:
	var rate := 22050
	var frames := maxi(1, int(dur * rate))
	var samples := PackedFloat32Array()
	samples.resize(frames)
	var phase := 0.0
	var from_safe := maxf(1.0, from_hz)
	var to_safe := maxf(1.0, to_hz)
	for i in frames:
		var k := float(i) / float(maxi(1, frames - 1))
		var freq := from_safe * pow(to_safe / from_safe, k)
		phase += freq / float(rate)
		var w: float = phase - floor(phase)
		var sample := 0.0
		if wave == "square":
			sample = 1.0 if w < 0.5 else -1.0
		elif wave == "triangle":
			sample = 4.0 * absf(w - 0.5) - 1.0
		elif wave == "sawtooth":
			sample = 2.0 * w - 1.0
		else:
			sample = sin(w * TAU)
		var env := gain * pow(0.0008 / maxf(gain, 0.0008), k)
		samples[i] = sample * env
	return samples


func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		var n := int(round(clampf(samples[i], -1.0, 1.0) * 32767.0))
		data.encode_s16(i * 2, n)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.stereo = false
	stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
	stream.data = data
	return stream


func _read_muted() -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return false
	return bool(cfg.get_value("audio", "nightfall-muted", false))


func _write_muted(value: bool) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SAVE_PATH)
	cfg.set_value("audio", "nightfall-muted", value)
	cfg.save(SAVE_PATH)
