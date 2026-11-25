import { expect, it } from 'vitest';
import {
  orthogonalSketchPointer as point,
  appendOrthogonalSketchPoint as add,
} from './orthogonal-sketch';
it.each([
  [160, 160],
  [320, 320],
  [480, 240],
  [240, 480],
])('maps letterboxed SVG %ix%i to physical mm', (width, height) => {
  const size = Math.min(width, height),
    left = (width - size) / 2,
    top = (height - size) / 2;
  expect(point(left + (size * 35) / 160, top + (size * 65) / 160, width, height)).toEqual([30, 60]);
  expect(point(width / 2, height / 2, width, height)).toEqual([75, 75]);
});
it('snaps only pointer coordinates to 1mm', () => {
  expect(point(35.4, 65.6, 160, 160)).toEqual([30, 61]);
  expect(point(5, 5, 160, 160)).toEqual([0, 0]);
  expect(point(155, 155, 160, 160)).toEqual([150, 150]);
});
it.each([
  [0, 0, 160, 160],
  [4.9, 80, 160, 160],
  [155.1, 80, 160, 160],
  [80, 155.1, 160, 160],
  [20, 120, 480, 240],
  [120, 20, 240, 480],
])('rejects margins and letterbox rather than clamping %#', (x, y, w, h) => {
  expect(() => point(x!, y!, w!, h!)).toThrow('OUTSIDE');
});
it.each([
  [0, 160],
  [160, 0],
  [-1, 160],
  [Infinity, 160],
  [160, NaN],
])('rejects invalid viewport %#', (w, h) => {
  expect(() => point(5, 5, w!, h!)).toThrow('VIEWPORT');
});
it('rejects nonfinite clicks and never silently inserts an elbow', () => {
  expect(() => point(NaN, 5, 160, 160)).toThrow('VIEWPORT');
  const p = point(35, 65, 160, 160);
  expect(() => add([[0, 0]], p[0], p[1])).toThrow('AXIS');
});
