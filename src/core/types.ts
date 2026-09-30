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
}

export interface StrokeEntity extends EntityBase {
  kind: 'stroke';
  /** Flat point list [x0, y0, x1, y1, …] in mm. */
  pts: number[];
}

export type Entity = LineEntity | StrokeEntity;

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
