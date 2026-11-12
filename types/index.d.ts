export type Value = string | number;

export interface NumberControl {
  key: string;
  type: 'number';
  value: number;
  min: number;
  max: number;
  step: number;
  about?: string;
}

export interface TextControl {
  key: string;
  type: 'text';
  value: string;
  about?: string;
}

export interface ToggleControl {
  key: string;
  type: 'toggle';
  value: number;
  about?: string;
}

export interface ColorControl {
  key: string;
  type: 'color';
  value: string;
  about?: string;
}

export interface SelectControl {
  key: string;
  type: 'select';
  value: string;
  options: readonly string[];
  about?: string;
}

export type Control = NumberControl | TextControl | ToggleControl | ColorControl | SelectControl;

export interface Group {
  name: string;
  about?: string;
  hidden?: boolean;
  controls: readonly Control[];
}

// What the store builds from a control: the same fields, its path, group and
// normalized default, frozen. It stays a union on `type`, as the store always
// sets a number's range and a select's options.
type Built<C extends Control> = C extends Control
  ? Readonly<C & { path: string; group: string; default: C['value'] }>
  : never;

export type BuiltControl = Built<Control>;

export interface BuiltGroup {
  readonly name: string;
  readonly about: string;
  readonly hidden: boolean;
  readonly controls: readonly BuiltControl[];
}

export interface Listener {
  (value: Value, path: string): void;
}

export interface Store {
  groups: readonly BuiltGroup[];
  byPath: ReadonlyMap<string, BuiltControl>;
  control(path: string): Value;
  fileValue(path: string): Value;
  onControl(path: string, listener: Listener): () => void;
  subscribe(listener: Listener): () => void;
  set(path: string, value: Value): boolean;
  reset(paths?: readonly string[]): void;
  changed(): Record<string, Value>;
  attach(storage: StorageArea, key: string): void;
  detach(): void;
}

export interface StorageArea {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function defineControls(groups: readonly Group[], fileValues?: Record<string, Value>): Store;

export interface Command {
  usage?: string;
  about?: string;
  run(args: readonly string[]): string | void;
}

export interface FocusState {
  open: boolean;
  groups: readonly string[];
}

export interface Extras {
  get(): Record<string, unknown>;
  set(data: Record<string, unknown>): void;
}

// The drawer calls a panel's update while its page shows. Teardown is the
// page's own destroy; a panel has none.
export interface PagePanel {
  update?(): void;
}

export interface Page {
  name: string;
  label?: string;
  about?: string;
  mount(el: HTMLElement): PagePanel | void;
  show?(): void;
  hide?(): void;
  destroy?(): void;
}

export interface Visual {
  frame(now: number): void;
  destroy?(): void;
}

export interface MountOptions {
  name: string;
  commands?: Readonly<Record<string, Command>>;
  status?: () => string;
  onFocus?: (state: FocusState) => void;
  extras?: Extras;
  pages?: readonly Page[];
  visuals?: Readonly<Record<string, (host: HTMLElement) => Visual>>;
  stats?: () => object;
}

export function mountKnobs(store: Store, options: MountOptions): () => void;

export interface Panel {
  x: number;
  w: number;
}

export interface Pen {
  ctx: CanvasRenderingContext2D;
  fg: string;
  dim: string;
  rule: string;
  bg: string;
  font: string;
  width(text: string): number;
  text(text: string, x: number, y: number): void;
  line(x0: number, y0: number, x1: number, y1: number, stroke?: string, width?: number, dash?: readonly number[]): void;
  plot(points: ReadonlyArray<readonly [number, number]>, stroke?: string, width?: number, dash?: readonly number[]): void;
  dot(x: number, y: number, r?: number, fill?: string): void;
  ring(x: number, y: number, r: number, stroke?: string, width?: number): void;
  box(x: number, y: number, w: number, h: number, stroke?: string): void;
  fill(x: number, y: number, w: number, h: number, fill?: string): void;
  panels(total: number, weights: readonly number[], gap?: number): Panel[];
  within(panel: Panel, draw: () => void): void;
  ends(w: number, y: number, left: string, right?: string): void;
  title(w: number, left: string, right?: string): void;
  legend(x: number, y: number, items: readonly { label: string; stroke?: string; dash?: readonly number[] }[], w: number): void;
}

export function makePen(ctx: CanvasRenderingContext2D, el: Element): Pen;

export function canvasVisual(
  label: string,
  make: () => (pen: Pen, width: number, height: number, now: number) => void,
): (host: HTMLElement) => Visual;

export function pixels(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
};

export function trace(): {
  add(now: number, ...values: number[]): void;
  draw(
    pen: Pen,
    now: number,
    width: number,
    top: number,
    base: number,
    index: number,
    stroke?: string,
    lineWidth?: number,
    dash?: readonly number[],
  ): void;
};

export function fit(
  bounds: readonly [number, number, number, number],
  width: number,
  top: number,
  base: number,
): { k: number; x(value: number): number; y(value: number): number };
