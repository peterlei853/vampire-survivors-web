extends SceneTree

## Headless check: load the main scene, move, spawn, stake a kill, and level up.
## _ready is deferred when nodes are added from SceneTree._initialize, so the
## simulation starts on the first frame.

var _main
var _result: Dictionary = {}
var _phase := 0


func _initialize() -> void:
	var packed = load("res://scenes/main.tscn")
	if packed == null:
		printerr("SMOKE FAIL: main scene did not load")
		quit(1)
		return
	_main = packed.instantiate()
	root.add_child(_main)
	process_frame.connect(_on_frame)


func _on_frame() -> void:
	if _phase == 0:
		_phase = 1
		_result = _main.run_smoke()
		if _main.world:
			_main.world.queue_redraw()
		return
	process_frame.disconnect(_on_frame)
	if bool(_result.get("ok", false)):
		print(_result.get("log", "SMOKE OK"))
		quit(0)
	else:
		printerr(_result.get("log", "SMOKE FAIL"))
		quit(1)
