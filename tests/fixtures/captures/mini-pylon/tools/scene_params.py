"""Adjustable parameters of the hyperreal scene (tools/render_hyperreal.py).

One list, shared by Blender, the tweak server and the tweak page. Every value has a
path `<group>.<key>`. The defaults are the late-afternoon road-edge scene with the
yellow base. The pylon's dimensions are not parameters: they come only from
build_model.py.
"""
import re

N, T, C, COL = "number", "toggle", "choice", "color"


def _v(key, kind, default, about, lo=None, hi=None, step=None, choices=None):
    v = {"key": key, "type": kind, "default": default, "about": about}
    if kind == N:
        v.update(min=lo, max=hi, step=step)
    if kind == C:
        v["choices"] = choices
    return v


GROUPS = [
    {"name": "ground", "about": "the surface the pylon stands on", "vars": [
        _v("surface", C, "asphalt", "asphalt road edge, concrete slab, or a seamless studio sweep",
           choices=["asphalt", "concrete", "studio"]),
        _v("wear", N, 0.8, "asphalt and concrete: how blotchy and worn the surface is", 0, 1.5, 0.05),
        _v("wetness", N, 0.0, "darkens and glosses the whole ground, as after rain", 0, 1, 0.05),
        _v("puddle", T, 1, "a shallow puddle in front of the pylon"),
        _v("puddle_size", N, 1.0, "puddle size, relative to the default", 0.3, 3, 0.05),
        _v("puddle_toward", N, 0.52, "puddle distance from the pylon toward the camera (m)", -1, 1.5, 0.02),
        _v("puddle_across", N, 0.12, "puddle offset across the view (m, + is right)", -1.5, 1.5, 0.02),
        _v("line", T, 1, "a painted line between the pylon and the curb"),
        _v("line_color", C, "yellow", "painted line colour", choices=["yellow", "white"]),
        _v("line_toward", N, -0.52, "line distance from the pylon (m, - is away from the camera)", -1.2, 1.4, 0.02),
        _v("crack", T, 1, "a sealed crack running across the frame"),
        _v("patch", T, 1, "asphalt only: a patched rectangle of newer asphalt"),
        _v("joints", T, 1, "concrete only: saw-cut joints between slabs"),
        _v("tone", N, 0.75, "studio only: sweep brightness, dark to light", 0, 1, 0.05),
    ]},
    {"name": "clutter", "about": "loose things on and around the ground", "vars": [
        _v("gravel", N, 520, "number of loose stones", 0, 1500, 10),
        _v("leaves", N, 6, "number of dry leaves", 0, 30, 1),
        _v("curb", T, 1, "concrete curb and sidewalk behind the pylon (not in the studio)"),
        _v("curb_distance", N, 0.95, "how far behind the pylon the curb runs (m)", 0.5, 2.5, 0.05),
    ]},
    {"name": "light", "about": "sun, sky and a street lamp", "vars": [
        _v("world", C, "sky", "physical sky, or a plain grey studio surround", choices=["sky", "studio"]),
        _v("sun_elevation", N, 16, "sun height above the horizon (degrees)", 1, 85, 1),
        _v("sun_azimuth", N, -18.4, "sun direction around the scene (degrees)", -180, 180, 0.5),
        _v("sun_strength", N, 5.5, "sunlight strength; 0 for no sun", 0, 15, 0.1),
        _v("sun_warmth", N, 0.5, "sunlight colour, white to deep amber", 0, 1, 0.05),
        _v("sun_softness", N, 1.2, "sun size (degrees): larger gives softer shadows, like haze or a softbox", 0.2, 30, 0.2),
        _v("sky_fill", N, 0.1, "how much the sky lights the scene", 0, 1.5, 0.01),
        _v("sky_reflect", N, 0.32, "how bright the sky looks in reflections (wet ground, puddle)", 0, 2, 0.01),
        _v("haze", N, 2.0, "dust in the air: warmer, flatter sky", 0, 10, 0.1),
        _v("lamp", N, 0, "street lamp above and behind the pylon (W); 0 for off", 0, 20000, 100),
        _v("lamp_warmth", N, 0.8, "street lamp colour, white to sodium orange", 0, 1, 0.05),
    ]},
    {"name": "camera", "about": "where the camera stands and its lens", "vars": [
        _v("orbit", N, 35, "camera direction around the pylon (degrees); the scene stays put", 0, 360, 1),
        _v("height", N, 30, "camera angle above the ground (degrees)", 2, 85, 1),
        _v("lens", N, 85, "focal length (mm, full frame)", 24, 200, 1),
        _v("fstop", N, 1.8, "aperture: lower blurs the background more", 1.2, 22, 0.1),
        _v("fill", N, 0.8, "how much of the frame the pylon fills", 0.2, 0.95, 0.01),
    ]},
    {"name": "pylon", "about": "colours and weathering; the shape is fixed", "vars": [
        _v("base", C, "yellow", "base treatment", choices=["yellow", "black", "trim"]),
        _v("body", COL, "#1F4BFF", "cone colour"),
        _v("weathering", N, 1.0, "grime, dust, streaks and scuffs, relative to the default", 0, 2, 0.05),
        _v("stripe_width", N, 1.0, "white stripe width about each stripe's centre; 1 is the model's", 0.4, 2, 0.05),
    ]},
    {"name": "render", "about": "preview quality (finals use /render)", "vars": [
        _v("preview_size", N, 480, "preview width and height (px)", 240, 1080, 60),
        _v("preview_samples", N, 24, "preview samples: more is cleaner and slower", 4, 256, 4),
    ]},
]

PRESETS = {
    "afternoon": {"about": "late-afternoon sun at the road edge (the default)", "values": {}},
    "overcast": {"about": "flat grey daylight, damp ground", "values": {
        "light.world": "studio", "light.sun_elevation": 50, "light.sun_strength": 0.6,
        "light.sun_softness": 30, "light.sun_warmth": 0.1, "light.sky_fill": 0.45,
        "light.sky_reflect": 0.55, "ground.wetness": 0.35}},
    "dusk": {"about": "sun on the horizon, long amber light", "values": {
        "light.sun_elevation": 4, "light.sun_strength": 2.5, "light.sun_warmth": 0.9,
        "light.sky_fill": 0.12, "light.sky_reflect": 0.5, "light.haze": 4}},
    "wet-night": {"about": "rain-soaked road under a sodium street lamp", "values": {
        "light.sun_strength": 0, "light.sky_fill": 0.005, "light.sky_reflect": 0.02,
        "light.lamp": 1200, "light.lamp_warmth": 0.85,
        "ground.wetness": 0.9, "ground.puddle_size": 1.8}},
    "concrete": {"about": "concrete slab with a white line, afternoon sun", "values": {
        "ground.surface": "concrete", "ground.line_color": "white", "clutter.gravel": 120,
        "clutter.leaves": 3}},
    "studio": {"about": "seamless studio sweep, soft key light", "values": {
        "ground.surface": "studio", "light.world": "studio", "ground.puddle": 0,
        "clutter.gravel": 0, "clutter.leaves": 0, "clutter.curb": 0,
        "light.sun_elevation": 50, "light.sun_azimuth": -40, "light.sun_strength": 3,
        "light.sun_softness": 14, "light.sun_warmth": 0.1,
        "light.sky_fill": 0.6, "light.sky_reflect": 0.6, "camera.height": 20}},
}

SCENE_GROUPS = [g["name"] for g in GROUPS if g["name"] != "render"]
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def variables(include_render=True):
    return [dict(v, path=f"{g['name']}.{v['key']}") for g in GROUPS
            if include_render or g["name"] in SCENE_GROUPS for v in g["vars"]]


def by_path():
    return {v["path"]: v for v in variables()}


def defaults(include_render=False):
    return {v["path"]: v["default"] for v in variables(include_render)}


def _coerce(v, value):
    path = v["path"]
    if v["type"] == N:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{path}: not a number: {value!r}")
        return min(v["max"], max(v["min"], value))
    if v["type"] == T:
        if value not in (0, 1, True, False):
            raise ValueError(f"{path}: not on or off: {value!r}")
        return int(value)
    if v["type"] == C:
        if value not in v["choices"]:
            raise ValueError(f"{path}: {value!r} is not one of {', '.join(v['choices'])}")
        return value
    if not isinstance(value, str) or not _HEX.match(value):
        raise ValueError(f"{path}: not a #RRGGBB colour: {value!r}")
    return value.upper()


def resolve(overrides, include_render=False):
    """Defaults with overrides applied, checked and clamped. Raises ValueError."""
    paths = by_path()
    out = defaults(include_render)
    for path, value in (overrides or {}).items():
        if path not in paths:
            raise ValueError(f"unknown parameter: {path}")
        if path in out:
            out[path] = _coerce(paths[path], value)
        else:
            _coerce(paths[path], value)  # a render setting: checked, not a scene value
    return out


def schema():
    return {"groups": GROUPS, "presets": PRESETS}
