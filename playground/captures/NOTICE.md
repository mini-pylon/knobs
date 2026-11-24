# Captures notice

Each `<project>/source/` folder is a dated snapshot of another project's own front-end code, copied by `npm run playground:capture` so the playground can show that project's drawer, controls and pictures as it draws them.

`wings-vdb/source/` is © wings-vdb and `mini-pylon/source/` is © mini-pylon (its recorded renders included). All rights reserved.

These folders are in knobs as reference fixtures for the playground only. They are not covered by knobs' MIT licence (`LICENSE`), which covers the rest of the repository.

No font file is included. wings-vdb's fonts are read from a local checkout at run time and are never committed.

Each `capture.json` lists every vendored file with its source path and sha256, and the stubbed modules. `npm run playground:capture` never writes this notice.
