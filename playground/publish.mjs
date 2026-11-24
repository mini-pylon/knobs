// Putting a finished capture in place. A run builds into a dot folder, moves
// the last capture aside, then renames the new one onto <out>/<project>.
// The fs calls are an optional argument so a test can make one throw.
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const defaults = { existsSync, readdirSync, renameSync, rmSync, statSync };

function using(fs) {
  return fs ? { ...defaults, ...fs } : defaults;
}

// Step 1. A run that died between the two renames left no <project> folder
// and the last capture as .<project>-old-…. Put the newest of those back,
// then remove every other dot folder this project left behind.
export function recover(out, project, fs) {
  const files = using(fs);
  const dest = join(out, project);
  if (!files.existsSync(dest)) {
    const olds = files.readdirSync(out).filter(name => name.startsWith(`.${project}-old-`));
    if (olds.length) {
      olds.sort((a, b) => files.statSync(join(out, b)).mtimeMs - files.statSync(join(out, a)).mtimeMs);
      files.renameSync(join(out, olds[0]), dest);
    }
  }
  for (const name of files.readdirSync(out)) {
    if (name.startsWith(`.${project}-`)) files.rmSync(join(out, name), { recursive: true, force: true });
  }
}

// Step 4's rename back. Returns the error instead of throwing, so the
// caller still has the failure that made the rename necessary.
export function restoreAside(aside, dest, fs) {
  const files = using(fs);
  if (!aside || !dest) return null;
  let missing = false;
  try {
    missing = !files.existsSync(dest);
  } catch (error) {
    return error;
  }
  if (!missing) return null;
  try {
    files.renameSync(aside, dest);
    return null;
  } catch (error) {
    return error;
  }
}

// Step 3. Moves the last capture aside, then the partial folder into place.
// When the second rename throws, the last capture is put back and the
// original error is rethrown. A rename-back that itself throws is attached
// as renameBack, and aside names the folder that still holds the last capture.
export function placeCapture({ out, project, partial, dest, fs }) {
  const files = using(fs);
  let aside = null;
  let moved = false;
  try {
    if (files.existsSync(dest)) {
      aside = join(out, `.${project}-old-${randomBytes(4).toString('hex')}`);
      files.renameSync(dest, aside);
      moved = true;
    }
    files.renameSync(partial, dest);
    return { aside };
  } catch (error) {
    if (moved) {
      const renameBack = restoreAside(aside, dest, fs);
      if (renameBack) {
        error.renameBack = renameBack;
        error.aside = aside;
      }
    }
    throw error;
  }
}

// The removal after publishing. A failure is a warning, not a throw: the
// new capture is already in place.
export function removeAside(aside, fs) {
  const files = using(fs);
  try {
    files.rmSync(aside, { recursive: true, force: true });
    return null;
  } catch (error) {
    return `capture: could not remove ${aside}: ${error.message}; the next capture removes it`;
  }
}
