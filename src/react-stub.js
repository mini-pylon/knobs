// Stand-in for knobs/react while the plugin loads a controls file in Node.
// The real binding imports React, which is not installed on this package.
export function bindReact() {
  return function useControl() {
    throw new Error('knobs: useControl cannot run while the Vite plugin loads the schema');
  };
}
