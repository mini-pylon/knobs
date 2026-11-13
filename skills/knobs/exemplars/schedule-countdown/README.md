# schedule-countdown

## When

A group that sets how often something happens, with some randomness.

## What makes it good

- **Look:** the time window is labelled.
- **Behaviour:** the countdown is live. Two screenshots a second apart show N one lower.
- **Behaviour:** random draws come from a fixed seed. Move `jitter` and the ticks shift but keep their order; move `interval` and the pattern stretches.

## Adapting

Rename the group and its keys to the project's own. Use the project's own seed and spawn rule in place of the stand-in. Keep the window's label and the live countdown.
