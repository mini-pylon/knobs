# renders-tab

## When

A project where a change is costly to see, so renders run on demand.

## What makes it good

- **Look:** the pending count is in the status line.
- **Look:** each history entry shows its values and a thumbnail, newest first.
- **Behaviour:** typing is not blocked while a render runs. Type `render`, then `ls` at once: the listing prints before the render lands.
- **Behaviour:** after `render`, the status clears.

## Adapting

Replace the stand-in render with the project's own. Keep the snapshot, so changes made during a render count against the values it actually used.

If knobs grows this, prefer it: https://github.com/mini-pylon/knobs/issues/10

`status` is a single mount option, so a project with its own status line merges the two into one function.
