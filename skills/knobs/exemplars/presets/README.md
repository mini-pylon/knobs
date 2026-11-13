# presets

## When

A project whose user wants a few named looks to flip between.

## What makes it good

- **Behaviour:** `preset` lists each preset with its `about`.
- **Behaviour:** `preset <name>` sets only the keys the preset names. Check with `ls look` before and after.
- **Behaviour:** it never touches the kept group (`ls quality` is unchanged).
- **Behaviour:** `reset` still returns every default.
- **Behaviour:** an unknown name prints an error.

## Adapting

Name the presets after the project's looks, and keep one group out of them. This exemplar keeps `quality`.

If knobs grows this, prefer it: https://github.com/mini-pylon/knobs/issues/4

`commands`, `pages` and `status` are single mount options, so merge this extension's into the project's: one command map, one page list, one status function. Step 4 of the skill's `pictures.md` shows how.
