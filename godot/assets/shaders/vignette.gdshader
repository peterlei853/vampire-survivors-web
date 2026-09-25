shader_type canvas_item;
render_mode blend_mix;

void fragment() {
	vec2 p = UV - vec2(0.5);
	p.x *= 1.15;
	float d = length(p);
	float v = smoothstep(0.2, 0.92, d);
	COLOR = vec4(0.0, 0.0, 0.0, v * 0.55);
}
