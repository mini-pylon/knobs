# Pictures

For each picture or extension the user kept:

1. Read the chosen exemplar's README, then its code.
2. Copy it into the project next to the mount component. In a JavaScript
   project that file is `knobs/<group>.js`. In a TypeScript project it is
   `knobs/<group>.ts`, with the JSDoc turned into annotations, because
   `allowJs` is not set in Vite's TypeScript templates. Replace
   `store.control` with the project's `control` import.
3. Replace the stand-in maths with the project's own. Where the page
   computes the value with a function, import that function, so the
   picture cannot drift from the page.
4. Add the picture to `visuals`, or merge the extension into the mount
   options. `mountKnobs` takes one `commands` map, one `pages` list and one
   `status` function, so a plain spread keeps only the last extension's
   commands and pages. Merge each with the project's own. Name each
   extension's result, so each keeps its own type in a TypeScript project,
   and leave out what the project or an extension does not have:

   ```js
   const looks = presets(store);
   const renders = rendersTab(store);
   mountKnobs(store, {
     name,
     commands: { ...ownCommands, ...looks.commands, ...renders.commands },
     pages: [...ownPages, ...renders.pages],
     status: () => [ownStatus(), renders.status()].filter(Boolean).join('  '),
   });
   ```

   Keep every command and page name distinct across the project and its
   extensions, and off the built-in commands (`help`, `ls`, `get`, `set`,
   `reset`, `save`, `download`, `load`, `export`, `import`, `on`, `clear`,
   `close`) and views (`console`, `params`, `performance`). A built-in
   command runs instead of an extension's, and a later page with a name
   already used replaces the earlier one's pane. Rename on a clash.
5. **Check.**
   - Run the dev server and open it with the agent's own browser tool, at
     least 761 px wide. Pictures and the status line are hidden below that.
   - Press backtick, open the group, and screenshot the drawer at 1280 px
     wide and at 761 px wide. 761 px is the narrowest width that shows
     pictures, so the narrow shot catches clipping.
   - Check each **Look:** point against the screenshots, and each
     **Behaviour:** point by doing what it says (more screenshots over
     time, or a control changed between two). Fix what fails and look
     again.
   - After three rounds, stop and show the user what is still off.
   - With no browser tool, ask the user to open the drawer in a window at
     least 761 px wide and send a screenshot.
6. Show the final screenshot with the hand-over.

The default install keeps a copy under `.agents/skills/knobs`, which a
broad `include` in the project's tsconfig or eslint config may pick up.
