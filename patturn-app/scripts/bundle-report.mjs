import { staticGraph, graphFiles } from './bundle-graph.mjs';
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
function summary(graph) {
  const files = graphFiles(manifest, graph);
  return files.reduce(
    (result, file) => {
      const bytes = readFileSync(path.join(folder, file));
      return {
        rawBytes: result.rawBytes + bytes.length,
        gzipBytes: result.gzipBytes + gzipSync(bytes).length,
      };
    },
    { rawBytes: 0, gzipBytes: 0 },
  );
}
const core = staticGraph(manifest, entry);
const viewport = keys.find((key) => key.endsWith('/Viewport.tsx'));
if (!viewport) throw new Error('LAZY_VIEWPORT_MISSING');
const viewerGraph = staticGraph(manifest, viewport);
const editor = new Set([...core, ...viewerGraph]);
const heavy = keys.filter((key) => /jspdf|vazirmatn/.test(key));
if (heavy.length < 2 || heavy.some((key) => editor.has(key))) throw new Error('PDF_NOT_LAZY');
const optionalTools = [
  'ChuckTool',
  'RounderTool',
  'HorizontalSplitTool',
  'JigsawTool',
  'SlabTool',
  'RibTool',
  'ExtruderTool',
  'LoftSweepTool',
  'ImageTraceTool',
  'FootRingTool',
];
for (const name of optionalTools) {
  const key = keys.find((key) => key.endsWith(`/${name}.tsx`));
  if (!key || editor.has(key)) throw Error(`OPTIONAL_TOOL_NOT_LAZY: ${name}`);
}
const sqliteHistory = keys.find((key) => key.endsWith('/sqlite-history.ts'));
if (!sqliteHistory || editor.has(sqliteHistory)) throw Error('SQLITE_HISTORY_NOT_LAZY');
const moldEngine = keys.find((key) => manifest[key].name === 'csg');
if (!moldEngine || editor.has(moldEngine)) throw Error('MOLD_ENGINE_NOT_LAZY');
const editorSummary = summary(editor);
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      entryStaticJs: summary(core),
      editorIncludingLazyViewportJs: editorSummary,
      roadmapBudget: {
        limitRawBytes: 600_000,
        actualRawBytes: editorSummary.rawBytes,
        met: editorSummary.rawBytes < 600_000,
        scope: 'editorIncludingLazyViewportJs',
        enforcing: false,
      },
      note: 'Viewport is requested on first render. PDF, WASM, workers and optional imports excluded. Not an LCP measurement.',
      pdfAndFontLazy: true,
      sqliteHistoryLazy: true,
      moldEngineLazy: true,
      optionalToolsLazy: optionalTools,
    },
    null,
    2,
  ),
);
