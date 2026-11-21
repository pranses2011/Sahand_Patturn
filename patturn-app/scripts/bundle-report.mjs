// Build artifact report, not a browser LCP or network performance measurement.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const folder = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(folder, '.vite/manifest.json'), 'utf8'));
const keys = Object.keys(manifest);
const entry = keys.find((key) => manifest[key].isEntry);
if (!entry) throw new Error('BUILD_ENTRY_MISSING');
function staticGraph(key, found = new Set()) {
  if (found.has(key)) return found;
  if (!manifest[key]) throw new Error(`BUILD_CHUNK_MISSING:${key}`);
  found.add(key);
  for (const imported of manifest[key].imports ?? []) staticGraph(imported, found);
  return found;
}
function summary(graph) {
  const files = [...new Set([...graph].map((key) => manifest[key].file).filter((name) => name.endsWith('.js')))];
  return files.reduce((result, file) => {
    const bytes = readFileSync(path.join(folder, file));
    return { rawBytes: result.rawBytes + bytes.length, gzipBytes: result.gzipBytes + gzipSync(bytes).length };
  }, { rawBytes: 0, gzipBytes: 0 });
}
const core = staticGraph(entry);
const viewport = keys.find((key) => key.endsWith('/Viewport.tsx'));
if (!viewport) throw new Error('LAZY_VIEWPORT_MISSING');
const viewerGraph = staticGraph(viewport);
const editor = new Set([...core, ...viewerGraph]);
const heavy = keys.filter((key) => /jspdf|vazirmatn/.test(key));
if (heavy.length < 2 || heavy.some((key) => editor.has(key))) throw new Error('PDF_NOT_LAZY');
console.log(JSON.stringify({
  entryStaticJs: summary(core),
  editorIncludingLazyViewportJs: summary(editor),
  note: 'Viewport is requested on first render. PDF, WASM, workers and optional imports excluded. Not an LCP measurement.',
  pdfAndFontLazy: true,
}, null, 2));
