import { EditorState, ProjectDoc, SCHEMA_VERSION } from '@patturn/schema';
import { PATTERNS } from '@patturn/patterns';
import type { ProjectRecord } from '@patturn/storage';
import { PRESETS, type ProfileMode } from './editor-presets';
const paramsKey = (params: Record<string, unknown>) =>
  JSON.stringify(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]]),
  );
/** Lossless bridge for the subset actually editable by this preset-based UI. */
export function editorProject(input: EditorState, name: string): ProjectRecord {
  const state = EditorState.parse(input),
    now = new Date().toISOString();
  const pattern = PATTERNS.find((p) => p.id === state.patternId);
  if (!pattern) throw Error('PROJECT_UNKNOWN_PATTERN');
  const data = ProjectDoc.parse({
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    settings: { unit: 'mm', shrink: state.shrink / 100, wallThickness: state.wall },
    form: {
      profile: { nodes: PRESETS[state.profileMode].map((p) => ({ x: p.r, y: p.y })), closed: true },
      symmetry: { mirrorX: false, mirrorY: false },
      fillLevel: state.fill / 100,
      segments: state.segments,
      wallThickness: state.wall,
    },
    pattern: {
      baseId: state.patternId,
      params: { ...pattern.defaults },
      tile: { width: state.tileSize, height: state.tileSize, seamlessX: true, seamlessY: true },
      canvas: { widthMm: 300, heightMm: 300 },
    },
  });
  return {
    id: crypto.randomUUID(),
    name,
    schemaVersion: SCHEMA_VERSION,
    data,
    createdAt: now,
    updatedAt: now,
  };
}
export function projectEditor(record: ProjectRecord): EditorState {
  const doc = ProjectDoc.strict().parse(record.data),
    form = doc.form,
    pattern = doc.pattern;
  const definition = PATTERNS.find((p) => p.id === pattern?.baseId);
  if (
    !form ||
    !pattern ||
    !definition ||
    doc.mold ||
    form.footRing ||
    form.symmetry.mirrorX ||
    form.symmetry.mirrorY ||
    !form.profile.closed ||
    pattern.mapping ||
    !pattern.tile.seamlessX ||
    !pattern.tile.seamlessY ||
    pattern.tile.width !== pattern.tile.height ||
    pattern.canvas.widthMm !== 300 ||
    pattern.canvas.heightMm !== 300 ||
    doc.settings.unit !== 'mm' ||
    doc.settings.wallThickness !== form.wallThickness ||
    paramsKey(pattern.params) !== paramsKey(definition.defaults)
  )
    throw Error('PROJECT_NOT_EDITABLE');
  const mode = (Object.keys(PRESETS) as ProfileMode[]).find(
    (mode) =>
      JSON.stringify(form.profile.nodes) ===
      JSON.stringify(PRESETS[mode].map((p) => ({ x: p.r, y: p.y }))),
  );
  if (!mode) throw Error('PROJECT_NOT_EDITABLE');
  // Round only reciprocal percentage conversion, never geometry coordinates.
  return EditorState.parse({
    profileMode: mode,
    segments: form.segments,
    wall: form.wallThickness,
    shrink: Math.round(doc.settings.shrink * 100 * 1e12) / 1e12,
    fill: Math.round(form.fillLevel * 100 * 1e12) / 1e12,
    patternId: pattern.baseId,
    tileSize: pattern.tile.width,
  });
}

/** Rebuild only an editable preset snapshot; retain identity, discard stale thumbnail. */
export function updatedEditorProject(previous: ProjectRecord, input: EditorState): ProjectRecord {
  projectEditor(previous); // refuse lossy replacement of a general document
  const fresh = editorProject(input, previous.name);
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString();
  return {
    ...fresh,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt,
    data: { ...(fresh.data as object), createdAt: previous.createdAt, updatedAt },
  };
}
