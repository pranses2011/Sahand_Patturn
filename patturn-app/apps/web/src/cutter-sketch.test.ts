import { expect, it } from 'vitest';
import { cutterSketchHit, cutterSketchPoint } from './cutter-sketch';
it.each([
  [160, 160],
  [320, 320],
  [480, 240],
])('maps viewport %ix%i to physical mm with the correct margin', (width, height) => {
  expect(cutterSketchPoint((width * 35) / 160, (height * 65) / 160, width, height)).toEqual([
    30, 60,
  ]);
  expect(cutterSketchPoint(width / 2, height / 2, width, height)).toEqual([75, 75]);
});
it('snaps and clamps input at workspace boundaries', () => {
  expect(cutterSketchPoint(-100, -100, 320, 320)).toEqual([0, 0]);
  expect(cutterSketchPoint(999, 999, 320, 320)).toEqual([150, 150]);
  expect(cutterSketchPoint(71.1, 70.9, 320, 320)).toEqual([31, 30]);
});
it.each([
  [0, 100],
  [100, 0],
  [NaN, 100],
  [100, Infinity],
])('rejects unusable viewport dimensions %j', (width, height) => {
  expect(() => cutterSketchPoint(0, 0, width, height)).toThrow('INVALID_VIEWPORT');
});

it('hit testing chooses the nearest vertex in CSS pixels with stable ties', () => {
  const points = [
    [20, 20],
    [30, 20],
  ] as const;
  expect(cutterSketchHit(points, 51, 50, 320, 320)).toBe(0);
  expect(cutterSketchHit(points, 65, 50, 320, 320)).toBe(1);
  expect(cutterSketchHit(points, 60, 50, 320, 320)).toBe(0);
  expect(cutterSketchHit(points, 50, 62, 320, 320)).toBe(0);
  expect(cutterSketchHit(points, 50, 62.1, 320, 320)).toBeNull();
});
it('hit testing preserves pixel tolerance for resized and nonsquare viewports', () => {
  expect(cutterSketchHit([[20, 20]], 75, 37.5, 480, 240)).toBe(0);
  expect(cutterSketchHit([[20, 20]], 87.1, 37.5, 480, 240)).toBeNull();
  expect(cutterSketchHit([], 0, 0, 320, 320)).toBeNull();
});
it('hit testing rejects unusable pointer coordinates and viewport', () => {
  expect(() => cutterSketchHit([], NaN, 0, 320, 320)).toThrow('INVALID_VIEWPORT');
  expect(() => cutterSketchHit([], 0, 0, 0, 320)).toThrow('INVALID_VIEWPORT');
});
