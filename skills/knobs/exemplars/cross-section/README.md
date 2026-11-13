# cross-section

## When

A group that shapes a soft edge, falloff or density.

## What makes it good

- **Look:** the slice and the profile share one x scale.
- **Look:** the threshold is marked.
- **Behaviour:** move `softness` and the edge blurs while the profile's slope flattens with it.
- **Behaviour:** it stays cheap. With the group open, the performance tab's frame rate does not drop.

## Adapting

Rename the group and its keys to the project's own. Import the project's density function in place of the stand-in. Keep the slice small.
