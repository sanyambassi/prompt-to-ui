/** UISchema — canonical tree format for AI output and persistence. */

export const CURRENT_SCHEMA_VERSION = 1;

export type LayoutMode =
  | "stack"
  | "grid"
  | "flex-row"
  | "flex-column"
  | "absolute";

export type UISchemaLayout = {
  mode: LayoutMode;
  gap?: number;
  columns?: number;
  padding?: number;
  /** absolute layout: child positions */
  x?: number;
  y?: number;
};

export type UISchema = {
  schema_version: number;
  id: string;
  type: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  layout?: UISchemaLayout;
  children?: UISchema[];
  interactions?: Record<string, unknown>;
};
