import type { Vec } from './geom';

export type PenKind = 'pencil' | 'ink';

/** ISO 128 line types used in the app. */
export type LineType = 'solid' | 'dashed' | 'dashdot' | 'dashdotdot' | 'freehand';

export interface Style {
  pen: PenKind;
  /** Nominal line width in mm. */
  width: number;
  lineType: LineType;
  /** Custom colour, or null for the pen's standard colour (graphite / black). */
  color: string | null;
}

interface EntityBase {
  id: string;
  layerId: string;
  /** Draw order within a layer (higher = on top). */
  z: number;
  style: Style;
}

export interface LineEntity extends EntityBase {
  kind: 'line';
  a: Vec;
  b: Vec;
  /** Marked as symmetry axis. */
  axis?: boolean;
  /** For axes: new drawing is mirrored across it. */
  mirror?: boolean;
}

export interface StrokeEntity extends EntityBase {
  kind: 'stroke';
  /** Flat point list [x0, y0, x1, y1, …] in mm. */
  pts: number[];
}

export interface CircleEntity extends EntityBase {
  kind: 'circle';
  c: Vec;
  r: number;
  /** Draw a centre-line cross. */
  mark?: boolean;
}

/**
 * Circular arc. Angles are in world coordinates (radians, y pointing down), so a
 * positive sweep turns clockwise on screen. The arc runs from `start` to `start + sweep`.
 */
export interface ArcEntity extends EntityBase {
  kind: 'arc';
  c: Vec;
  r: number;
  start: number;
  sweep: number;
  mark?: boolean;
}

export type Entity = LineEntity | StrokeEntity | CircleEntity | ArcEntity;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Shown faded, like a sketch under tracing paper. */
  dimmed: boolean;
}

export interface ViewState {
  scale: number;
  rot: number;
  tx: number;
  ty: number;
}

/** Serialised document (file format and autosave). */
export interface DocFile {
  format: 'skizzen-cad';
  version: 1;
  layers: Layer[];
  activeLayerId: string;
  entities: Entity[];
  nextZ: number;
  view?: ViewState;
}
