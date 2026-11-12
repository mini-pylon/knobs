// The only module that imports React. The server snapshot is the file
// value, never the live one, so a saved value cannot mismatch hydration.
import { useCallback, useSyncExternalStore } from 'react';

export function bindReact(store) {
  return function useControl(path) {
    const subscribe = useCallback(onChange => store.onControl(path, onChange), [path]);
    return useSyncExternalStore(
      subscribe,
      () => store.control(path),
      () => store.fileValue(path),
    );
  };
}
