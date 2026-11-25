import { expect, it } from 'vitest';
import { initialSketchHistory, sketchHistory } from './sketch-history';
import type { CutterPoint } from '@patturn/kernel';
const square: CutterPoint[] = [
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
];
it('copies its seed and committed points, supports empty contours, undo and redo', () => {
  const first = initialSketchHistory(square);
  expect(first.points).not.toBe(square);
  expect(first.points[0]).not.toBe(square[0]);
  const next = sketchHistory(first, { type: 'edit', points: [] });
  expect(next.points).toEqual([]);
  expect(first.points).toEqual(square);
  const undo = sketchHistory(next, { type: 'undo' });
  expect(undo.points).toEqual(square);
  expect(undo.points[0]).not.toBe(next.past[0]![0]);
  expect(sketchHistory(undo, { type: 'redo' }).points).toEqual([]);
});
it('groups any number of drag previews into a single completed edit', () => {
  const before = initialSketchHistory(square);
  let state = before;
  for (let i = 1; i <= 20; i++)
    state = sketchHistory(state, { type: 'preview', points: [[i, 0], ...square.slice(1)] });
  expect(state.past).toHaveLength(0);
  state = sketchHistory(state, { type: 'complete', before: before.points });
  expect(state.past).toHaveLength(1);
  const undo = sketchHistory(state, { type: 'undo' });
  expect(undo.points).toEqual(square);
  expect(sketchHistory(undo, { type: 'redo' }).points[0]).toEqual([20, 0]);
});
it('cancelled and no-op gestures preserve the existing redo branch', () => {
  const edit = sketchHistory(initialSketchHistory(square), { type: 'edit', points: [] });
  let state = sketchHistory(edit, { type: 'undo' });
  state = sketchHistory(state, { type: 'preview', points: [[2, 0], ...square.slice(1)] });
  state = sketchHistory(state, { type: 'cancel', points: square });
  expect(state.past).toHaveLength(0);
  expect(state.future).toEqual([[]]);
  const noOp = sketchHistory(state, { type: 'complete', before: square });
  expect(noOp).toBe(state);
  expect(sketchHistory(state, { type: 'edit', points: square })).toBe(state);
  expect(sketchHistory(state, { type: 'redo' }).points).toEqual([]);
});
it('a real edit after undo drops the redo branch and does not mutate earlier snapshots', () => {
  let state = sketchHistory(initialSketchHistory(square), { type: 'edit', points: [] });
  state = sketchHistory(state, { type: 'undo' });
  const points: CutterPoint[] = [[1, 0], ...square.slice(1)];
  const next = sketchHistory(state, { type: 'edit', points });
  expect(next.future).toEqual([]);
  expect(state.future).toEqual([[]]);
  expect(next.points).not.toBe(points);
  expect(next.past[0]).not.toBe(state.points);
});
it('caps the local edit history at 50 entries and bounds undo/redo at both ends', () => {
  let state = initialSketchHistory([]);
  expect(sketchHistory(state, { type: 'undo' })).toBe(state);
  expect(sketchHistory(state, { type: 'redo' })).toBe(state);
  for (let i = 0; i < 75; i++) state = sketchHistory(state, { type: 'edit', points: [[i, 0]] });
  expect(state.past).toHaveLength(50);
  for (let i = 0; i < 100; i++) state = sketchHistory(state, { type: 'undo' });
  expect(state.points).toEqual([[24, 0]]);
  expect(state.future).toHaveLength(50);
  for (let i = 0; i < 100; i++) state = sketchHistory(state, { type: 'redo' });
  expect(state.points).toEqual([[74, 0]]);
  expect(state.past).toHaveLength(50);
  expect(state.future).toHaveLength(0);
});

it('a successful file replacement resets both branches with an independent seed', () => {
  let state = sketchHistory(initialSketchHistory(square), { type: 'edit', points: [] });
  state = sketchHistory(state, { type: 'undo' });
  expect(state.future).toHaveLength(1);
  const seed: CutterPoint[] = [
    [10, 10],
    [50, 10],
    [50, 50],
    [10, 50],
  ];
  const reset = sketchHistory(state, { type: 'reset', points: seed });
  expect(reset.points).toEqual(seed);
  expect(reset.points[0]).not.toBe(seed[0]);
  expect(reset.past).toEqual([]);
  expect(reset.future).toEqual([]);
  expect(state.future).toHaveLength(1);
});
