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

`status` is a single mount option, so a project with its own status line merges the two into one function.
