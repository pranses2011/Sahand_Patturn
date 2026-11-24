import { expect, it } from 'vitest';
import { PATTERNS } from '@patturn/patterns';
import { editorProject, projectEditor } from './editor-project';
import { PRESETS, type ProfileMode } from './editor-presets';
import type { EditorState, ProjectDoc } from '@patturn/schema';
const defaults: EditorState = {
  profileMode: 'reference',
  segments: 96,
  wall: 4,
  shrink: 12,
  fill: 80,
  patternId: 'grid',
  tileSize: 40,
};
it.each(
  (Object.keys(PRESETS) as ProfileMode[]).flatMap((profileMode) =>
    PATTERNS.map((pattern) => ({ profileMode, patternId: pattern.id })),
  ),
)('round-trips editable parameters without sampled-profile loss: %j', (override) => {
  const state = { ...defaults, ...override };
  const record = editorProject(state, 'آزمون');
  expect(projectEditor(record)).toEqual(state);
  expect(JSON.stringify(record)).not.toContain('positions');
});
it('does not mutate presets and preserves fractional percentages within display precision', () => {
  const before = JSON.stringify(PRESETS);
  const state = { ...defaults, shrink: 12.345, fill: 67.891 };
  expect(projectEditor(editorProject(state, 'آزمون'))).toEqual(state);
  expect(JSON.stringify(PRESETS)).toBe(before);
});
it.each(['nodes', 'mapping', 'params', 'mold', 'foot', 'canvas', 'symmetry', 'unit'])(
  'rejects unsupported %s without silently simplifying a project',
  (kind) => {
    const record = editorProject(defaults, 'آزمون');
    const data = record.data as ProjectDoc;
    if (kind === 'nodes') data.form!.profile.nodes[1]!.x += 1;
    if (kind === 'mapping') data.pattern!.mapping = { mode: 'cylindrical', seamAt: 0, scale: 1 };
    if (kind === 'params') data.pattern!.params.newParameter = 1;
    if (kind === 'mold') data.mold = {} as ProjectDoc['mold'];
    if (kind === 'foot')
      data.form!.footRing = { enabled: true, width: 4, depth: 3, edge: 'square' };
    if (kind === 'canvas') data.pattern!.canvas.widthMm = 400;
    if (kind === 'symmetry') data.form!.symmetry.mirrorX = true;
    if (kind === 'unit') data.settings.unit = 'in';
    expect(() => projectEditor(record)).toThrow();
  },
);
