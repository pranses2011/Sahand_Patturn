import type { CutterPoint } from '@patturn/kernel';
export type SketchHistory = {
  points: CutterPoint[];
  past: CutterPoint[][];
  future: CutterPoint[][];
};
export type SketchHistoryAction =
  | { type: 'edit'; points: readonly CutterPoint[] }
  | { type: 'preview'; points: readonly CutterPoint[] }
  | { type: 'cancel'; points: readonly CutterPoint[] }
  | { type: 'reset'; points: readonly CutterPoint[] }
  | { type: 'complete'; before: readonly CutterPoint[] }
  | { type: 'undo' | 'redo' };
const copy = (points: readonly CutterPoint[]): CutterPoint[] => points.map((p) => [p[0], p[1]]);
const same = (a: readonly CutterPoint[], b: readonly CutterPoint[]) =>
  a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);
export function initialSketchHistory(points: readonly CutterPoint[]): SketchHistory {
  return { points: copy(points), past: [], future: [] };
}
/** 50 local contour edits; a drag is a preview followed by one complete, or a cancel. */
export function sketchHistory(state: SketchHistory, action: SketchHistoryAction): SketchHistory {
  if (action.type === 'reset') return initialSketchHistory(action.points);
  if (action.type === 'preview' || action.type === 'cancel')
    return { ...state, points: copy(action.points) };
  if (action.type === 'edit' || action.type === 'complete') {
    const before = action.type === 'edit' ? state.points : action.before;
    const after = action.type === 'edit' ? action.points : state.points;
    if (same(before, after)) return state;
    return { points: copy(after), past: [...state.past, copy(before)].slice(-50), future: [] };
  }
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      points: copy(state.past.at(-1)!),
      past: state.past.slice(0, -1),
      future: [copy(state.points), ...state.future].slice(0, 50),
    };
  }
  if (!state.future.length) return state;
  return {
    points: copy(state.future[0]!),
    past: [...state.past, copy(state.points)].slice(-50),
    future: state.future.slice(1),
  };
}
