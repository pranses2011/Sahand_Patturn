import { z } from 'zod';
import { ProjectDoc, SCHEMA_VERSION, migrate } from '@patturn/schema';
import type { ProjectRecord } from './index.js';
export const SQLITE_PROJECT_MAX_CHARACTERS = 256 * 1024;
const RecordSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
    data: z.unknown(),
    thumbnail: z
      .string()
      .max(128 * 1024)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
const timestamp = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw Error('PROJECT_INVALID_TIMESTAMP');
  return new Date(time).toISOString();
};
/** Snapshot before awaiting I/O, then migrate/validate parameter data, never geometry. */
export function validatedProjectRecord(input: unknown): ProjectRecord {
  const serialized = JSON.stringify(input);
  if (typeof serialized !== 'string' || serialized.length > SQLITE_PROJECT_MAX_CHARACTERS)
    throw Error('PROJECT_RECORD_TOO_LARGE');
  const record = RecordSchema.parse(JSON.parse(serialized));
  const version = z
    .object({ schemaVersion: z.number().int().min(1) })
    .parse(record.data).schemaVersion;
  if (version > SCHEMA_VERSION) throw Error('PROJECT_FROM_FUTURE_VERSION');
  if (version !== record.schemaVersion) throw Error('PROJECT_VERSION_MISMATCH');
  const data = ProjectDoc.strict().parse(migrate(record.data as { schemaVersion: number }));
  const createdAt = timestamp(record.createdAt),
    updatedAt = timestamp(record.updatedAt);
  if (
    Date.parse(updatedAt) < Date.parse(createdAt) ||
    data.name.trim() !== record.name ||
    timestamp(data.createdAt) !== createdAt ||
    timestamp(data.updatedAt) !== updatedAt
  )
    throw Error('PROJECT_METADATA_MISMATCH');
  if (
    (data.form?.profile.nodes.length ?? 0) > 512 ||
    Object.keys(data.pattern?.params ?? {}).length > 128
  )
    throw Error('PROJECT_PARAMETER_LIMIT');
  const normalized: ProjectRecord = {
    ...record,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    updatedAt,
    data: { ...data, name: record.name, createdAt, updatedAt },
  };
  if (JSON.stringify(normalized).length > SQLITE_PROJECT_MAX_CHARACTERS)
    throw Error('PROJECT_RECORD_TOO_LARGE');
  return normalized;
}

/** Snapshot and validate an external record before creating an independent identity. */
export function importedProjectCopy(input: ProjectRecord): ProjectRecord {
  const record = validatedProjectRecord(input);
  const now = new Date().toISOString();
  return validatedProjectRecord({
    ...record,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    data: { ...(record.data as object), createdAt: now, updatedAt: now },
  });
}

/** Rename metadata without rebuilding general parameter data or retaining caller aliases. */
export function renamedProject(input: ProjectRecord, newName: string): ProjectRecord {
  const record = validatedProjectRecord(input);
  const name = z.string().trim().min(1).max(200).parse(newName);
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(record.updatedAt))).toISOString();
  return validatedProjectRecord({
    ...record,
    name,
    updatedAt,
    data: { ...(record.data as object), name, updatedAt },
  });
}
