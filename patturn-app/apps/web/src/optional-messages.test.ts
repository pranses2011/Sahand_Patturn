import { expect, it } from 'vitest';
import messages from './messages/fa.json';
import {
  optionalMessageGroups,
  optionalMessageId,
  serializeOptionalMessages,
  assertOptionalMessagesLazy,
} from '../tooling/optional-messages';
it.each(optionalMessageGroups)(
  'projects %s from the single source without copying another group',
  (group) => {
    const code = serializeOptionalMessages(messages, group);
    expect(JSON.parse(code.slice('export default '.length, -1))).toEqual(messages[group]);
    expect(code).toBe(serializeOptionalMessages(messages, group));
    expect(optionalMessageId('virtual:patturn-messages/' + group)).toBe(group);
    expect(optionalMessageId('\0virtual:patturn-messages/' + group)).toBe(group);
  },
);
it('ignores unrelated imports but refuses unknown groups and traversal', () => {
  expect(optionalMessageId('react')).toBeNull();
  expect(optionalMessageId('/src/messages/fa.json')).toBeNull();
  for (const group of ['unknown', '../fa.json', '__proto__'])
    expect(() => optionalMessageId('virtual:patturn-messages/' + group)).toThrow('UNKNOWN');
});
it.each([{ cookieCutter: null }, { cookieCutter: [] }, { cookieCutter: 'text' }, {}])(
  'fails closed for missing or invalid source groups %#',
  (doc) => {
    expect(() => serializeOptionalMessages(doc, 'cookieCutter')).toThrow('INVALID');
  },
);
it('keeps serialization data-only for strings containing code-like text', () => {
  const data = { cookieCutter: { value: '"; globalThis.changed=true; //' } };
  const code = serializeOptionalMessages(data, 'cookieCutter');
  expect(JSON.parse(code.slice('export default '.length, -1))).toEqual(data.cookieCutter);
});
const optional = { '\0virtual:patturn-messages/orthogonalCutter': {} };
it('allows optional messages in dynamically loaded tool chunks only', () => {
  expect(() =>
    assertOptionalMessagesLazy({
      'index.js': { type: 'chunk', isEntry: true, imports: [], modules: { react: {} } },
      'tool.js': { type: 'chunk', imports: [], modules: optional },
    }),
  ).not.toThrow();
});
it.each(['entry', 'transitive', 'viewport'])(
  'rejects eagerly loaded messages through the %s graph',
  (mode) => {
    const bundle = {
      'index.js': {
        type: 'chunk',
        isEntry: true,
        imports: mode === 'transitive' ? ['shared.js'] : [],
        modules: mode === 'entry' ? optional : {},
      },
      'shared.js': {
        type: 'chunk',
        imports: ['index.js'],
        modules: mode === 'transitive' ? optional : {},
      },
      'viewport.js': {
        type: 'chunk',
        facadeModuleId: 'C:\\project\\src\\Viewport.tsx',
        imports: [],
        modules: mode === 'viewport' ? optional : {},
      },
    };
    expect(() => assertOptionalMessagesLazy(bundle)).toThrow('OPTIONAL_MESSAGES_NOT_LAZY');
  },
);
