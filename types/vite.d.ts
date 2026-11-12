import type { Plugin } from 'vite';

export interface Options {
  controls: string;
  origins?: readonly string[];
}

export default function knobs(options: Options): Plugin;
