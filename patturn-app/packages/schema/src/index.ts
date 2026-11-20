/**
 * Zod schemas for the project document (iron rule: project = params, not mesh).
 * SCHEMA_VERSION drives migrations — old files must never break.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 3;

export const Vec2 = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof Vec2>;

export const ProfileNode = z.object({
  x: z.number().min(0), // radius mm (>=0: profile is mirrored around Y axis)
  y: z.number(),        // height mm
  hIn: z.tuple([z.number(), z.number()]).optional(),
  hOut: z.tuple([z.number(), z.number()]).optional(),
});
export type ProfileNode = z.infer<typeof ProfileNode>;

export const FormNode = z.object({
  profile: z.object({
    nodes: z.array(ProfileNode).min(2),
    closed: z.boolean(),
  }),
  symmetry: z.object({ mirrorX: z.boolean(), mirrorY: z.boolean() }),
  footRing: z
    .object({
      enabled: z.boolean(),
      width: z.number().min(0),
      depth: z.number().min(0),
      edge: z.enum(['square', 'round', 'chamfer']),
    })
    .optional(),
  fillLevel: z.number().min(0).max(1),
  segments: z.number().int().min(12).max(512),
  wallThickness: z.number().min(0.5).max(50),
});
export type FormNode = z.infer<typeof FormNode>;

export const PatternNode = z.object({
  baseId: z.string(),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])),
  tile: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    seamlessX: z.boolean(),
    seamlessY: z.boolean(),
  }),
  canvas: z.object({ widthMm: z.number().positive(), heightMm: z.number().positive() }),
  mapping: z
    .object({
      mode: z.enum(['none', 'cylindrical', 'curvature']),
      seamAt: z.number().min(0).max(1),
      scale: z.number().positive(),
    })
    .optional(),
});
export type PatternNode = z.infer<typeof PatternNode>;

export const MoldNode = z.object({
  mode: z.enum(['single', 'multi']),
  parts: z.number().int().min(1).max(8),
  wallThickness: z.number().min(5).max(100),
  draftAngle: z.number().min(0).max(15),
  keys: z.object({
    type: z.enum(['tapered-cylinder', 'hemisphere']),
    size: z.number().min(4),
    taper: z.number().min(0).max(15),
    tolerance: z.number().min(0.1).max(0.5),
    count: z.number().int().min(0).max(12),
  }),
  mother: z
    .object({
      enabled: z.boolean(),
      kind: z.enum(['print', 'silicone']),
      flangeMm: z.number().min(0),
    })
    .optional(),
  horizontalSplits: z.array(z.number()).optional(),
});
export type MoldNode = z.infer<typeof MoldNode>;

export const ProjectDoc = z.object({
  schemaVersion: z.number().int(),
  name: z.string().min(1).max(200),
  form: FormNode.optional(),
  pattern: PatternNode.optional(),
  mold: MoldNode.optional(),
  settings: z.object({
    unit: z.enum(['mm', 'in']),
    shrink: z.number().min(0).max(0.3),
    wallThickness: z.number().min(0.5).max(50),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectDoc = z.infer<typeof ProjectDoc>;

/** Migration chain: v1 → v2 (add settings) → v3 (add mold.keys.count). */
export function migrate(doc: { schemaVersion: number }): ProjectDoc {
  let d = doc as Partial<ProjectDoc> & { schemaVersion: number };
  if (d.schemaVersion < 2) {
    d = { ...d, schemaVersion: 2, settings: { unit: 'mm', shrink: 0.12, wallThickness: 4 } };
  }
  if (d.schemaVersion < 3) {
    const mold = d.mold ? { ...d.mold, keys: { ...d.mold.keys, count: d.mold.keys.count ?? 4 } } : undefined;
    d = { ...d, schemaVersion: 3, mold };
  }
  if (d.schemaVersion > SCHEMA_VERSION) {
    throw new Error('PROJECT_FROM_FUTURE_VERSION');
  }
  return d as ProjectDoc;
}
