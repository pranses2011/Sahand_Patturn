import { isBuiltin } from 'node:module';
import path from 'node:path';

const dependencies = {
  config: [],
  schema: [],
  kernel: [],
  patterns: [],
  molds: ['kernel'],
  exporters: ['kernel', 'config'],
  storage: ['config', 'schema'],
};
const packages = Object.keys(dependencies);
function location(filename) {
  const normalized = filename.replaceAll('\\', '/');
  const match = normalized.match(/\/(packages|apps)\/([^/]+)\//);
  return match ? { kind: match[1], name: match[2] } : null;
}
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      boundary: 'Import {{source}} violates the internal package boundary ({{owner}}).',
      platform: 'Core package {{owner}} cannot depend on platform/UI module {{source}}.',
    },
  },
  create(context) {
    const filename = context.filename,
      owner = location(filename);
    if (!owner || owner.kind !== 'packages') return {};
    function check(node, source) {
      if (typeof source !== 'string') return;
      const isTest = /\.(test|spec)\.[cm]?[jt]sx?$/.test(filename);
      if (
        !isTest &&
        ['kernel', 'patterns', 'schema', 'config'].includes(owner.name) &&
        (isBuiltin(source) ||
          /^(?:@tauri-apps\/|react(?:$|\/)|react-dom(?:$|\/)|three(?:$|\/))/.test(source))
      ) {
        context.report({ node, messageId: 'platform', data: { source, owner: owner.name } });
        return;
      }
      let target;
      if (source.startsWith('@patturn/'))
        target = { kind: 'packages', name: source.slice(9).split('/')[0] };
      else if (source.startsWith('.'))
        target = location(path.resolve(path.dirname(filename), source));
      else return;
      if (!target) return;
      const allowed =
        target.kind === 'packages' &&
        packages.includes(target.name) &&
        (target.name === owner.name ||
          isTest ||
          (dependencies[owner.name] ?? []).includes(target.name));
      if (!allowed)
        context.report({ node, messageId: 'boundary', data: { source, owner: owner.name } });
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1
        )
          check(node, node.arguments[0].value);
      },
    };
  },
};
