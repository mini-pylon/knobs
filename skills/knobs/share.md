# Share

For each picture that passed its check and that the user liked, ask
whether to share it.

1. On a yes, first offer to make the code generic. Project names, copy
   text and identifying constants become neutral ones.
2. Show exactly what each field will hold.
3. Build this link, with the text fields URL-encoded by id. GitHub fills
   only text fields (inputs and textareas) from the URL. Dropdowns and
   checkboxes are not filled, so `kind` and the license tick are left to
   the user, and the license tick is their own consent.

   `https://github.com/mini-pylon/knobs/issues/new?template=exemplar.yml&title=exemplar: <a short name for the picture>&when=<when>&good=<good>&controls=<controls>&code=<code>`

   The text field ids are `when`, `good`, `controls` and `code`.
4. Measure the encoded link. Above 6,000 bytes, leave `code` out of the
   link, then `controls`, and name the file to paste from.
5. The user opens the link, picks the kind, ticks the license, drops in
   the screenshot they have already seen, reads it through, and submits
   it themselves.

The agent never files the issue itself. `gh` cannot attach an image, and
the user's own submit is the consent.
