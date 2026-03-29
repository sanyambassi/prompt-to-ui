import type { UISchema } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./types";

/**
 * Migrate between schema versions (inclusive). Defaults: from = schema.schema_version, to = CURRENT_SCHEMA_VERSION.
 */
export function migrateSchema(
  schema: UISchema,
  fromVersion: number = schema.schema_version ?? 1,
  toVersion: number = CURRENT_SCHEMA_VERSION,
): UISchema {
  let v = fromVersion;
  let current: UISchema = { ...schema, schema_version: v };

  while (v < toVersion) {
    current = runOneStep(current, v);
    v += 1;
    current = { ...current, schema_version: v };
  }

  return current;
}

/** Shorthand: migrate to latest version. */
export function migrateSchemaToLatest(schema: UISchema): UISchema {
  return migrateSchema(schema);
}

function runOneStep(schema: UISchema, fromVersion: number): UISchema {
  switch (fromVersion) {
    case 1:
      return schema;
    default:
      return schema;
  }
}
