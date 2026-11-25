import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
export const optionalMessageGroups = [
  'cookieCutter',
  'cookieSketch',
  'orthogonalCutter',
  'pixelTrace',
] as const;
const prefix = 'virtual:patturn-messages/';
export function optionalMessageId(id: string) {
  const name = id.startsWith('\0') ? id.slice(1) : id;
  if (!name.startsWith(prefix)) return null;
  const group = name.slice(prefix.length);
  if (!optionalMessageGroups.some((key) => key === group))
    throw Error(`UNKNOWN_OPTIONAL_MESSAGES: ${group}`);
  return group as (typeof optionalMessageGroups)[number];
}
export function serializeOptionalMessages(document: Record<string, unknown>, group: string) {
  if (
    !optionalMessageGroups.some((key) => key === group) ||
    !Object.hasOwn(document, group) ||
    typeof document[group] !== 'object' ||
    document[group] === null ||
    Array.isArray(document[group])
  )
    throw Error('INVALID_OPTIONAL_MESSAGES');
  // Source remains fa.json. This is a build-time projection, not a second catalogue.
  return `export default ${JSON.stringify(document[group])};`;
}
type BuiltChunk = {
  type: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: readonly string[];
  modules?: Record<string, unknown>;
};
/** Enforce the real static entry + first-render viewport graph, not just import source spelling. */
export function assertOptionalMessagesLazy(bundle: Readonly<Record<string, BuiltChunk>>) {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const chunk = bundle[name];
    if (!chunk || chunk.type !== 'chunk') return;
    for (const id of Object.keys(chunk.modules ?? {}))
      if (optionalMessageId(id))
        throw Error(`OPTIONAL_MESSAGES_NOT_LAZY: ${optionalMessageId(id)}`);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  };
  for (const [name, chunk] of Object.entries(bundle))
    if (
      chunk.type === 'chunk' &&
      (chunk.isEntry || chunk.facadeModuleId?.replaceAll('\\', '/').endsWith('/Viewport.tsx'))
    )
      visit(name);
}
export function optionalMessages(): Plugin {
  const file = fileURLToPath(new URL('../src/messages/fa.json', import.meta.url));
  return {
    name: 'patturn-optional-messages',
    enforce: 'pre',
    resolveId(id) {
      return optionalMessageId(id) ? (id.startsWith('\0') ? id : '\0' + id) : null;
    },
    generateBundle(_options, bundle) {
      assertOptionalMessagesLazy(bundle);
    },
    handleHotUpdate({ file: changed, server, modules: originalModules }) {
      if (changed !== file) return;
      const modules = optionalMessageGroups.flatMap((group) => {
        const module = server.moduleGraph.getModuleById('\0' + prefix + group);
        return module ? [module] : [];
      });
      for (const module of modules) server.moduleGraph.invalidateModule(module);
      return [...new Set([...originalModules, ...modules])];
    },
    load(id) {
      const group = optionalMessageId(id);
      if (!group) return null;
      this.addWatchFile(file);
      return serializeOptionalMessages(JSON.parse(readFileSync(file, 'utf8')), group);
    },
  };
}
