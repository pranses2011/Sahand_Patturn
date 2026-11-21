import { describe, expect, it } from 'vitest';
import { preserveNativeUndo } from './native-undo';

describe('Undo shortcut ownership', () => {
  it.each([
    ['INPUT', 'range', false, false],
    ['input', 'RANGE', false, false],
    ['INPUT', 'number', false, true],
    ['INPUT', 'search', false, true],
    ['INPUT', null, false, true],
    ['TEXTAREA', null, false, true],
    ['SELECT', null, false, true],
    ['DIV', null, true, true],
    ['BUTTON', null, false, false],
  ] as const)('%s / %s / editable=%s preserves native undo=%s', (tag, type, editable, expected) => {
    expect(preserveNativeUndo(tag, type, editable)).toBe(expected);
  });
});
