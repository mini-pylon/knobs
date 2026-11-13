# curve-trace

## When

A group that shapes an animation over time: a duration, an easing and a delay.

## What makes it good

- **Look:** the current point is marked with a dot on the curve.
- **Look:** the time axis ends read `0 ms` and the duration in ms.
- **Look:** with `spring` and some overshoot, the curve rises above the dashed 1.0 line.
- **Behaviour:** it loops at true speed. Set `duration 2000` and `delay 0`: the dot takes about two seconds to cross.

## Adapting

Rename the group and its keys to the project's own. Replace the stand-in easing with an import of the function the page animates with. Keep the dot, the trail, the 1.0 line and the units.
