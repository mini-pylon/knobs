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
4. Add the picture to `visuals`, or spread the extension into the mount
   options, merging `status` with any status the project has.
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
