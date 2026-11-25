import { staticGraph } from './bundle-graph.mjs';
import { measureGraph, budgetResult, incrementalGraph } from './bundle-metrics.mjs';
// Build artifact report, not a browser LCP or network performance measurement.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const enforcing = process.argv.includes('--enforce-budget');
if (process.argv.slice(2).some((arg) => arg !== '--enforce-budget'))
  throw Error('UNKNOWN_BUNDLE_REPORT_ARGUMENT');
const folder = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(folder, '.vite/manifest.json'), 'utf8'));
const keys = Object.keys(manifest);
const entry = keys.find((key) => manifest[key].isEntry);
if (!entry) throw new Error('BUILD_ENTRY_MISSING');
function summary(graph) {
  return measureGraph(manifest, graph, (file) => readFileSync(path.join(folder, file)));
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
  'CookieCutterTool',
  'OrthogonalCutterTool',
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
const cutterBundle = keys.find((key) => key.endsWith('/orthogonal-cutter-bundle.ts'));
if (!cutterBundle || !manifest[cutterBundle].isDynamicEntry || editor.has(cutterBundle))
  throw Error('CUTTER_BUNDLE_NOT_LAZY');
const sqliteHistory = keys.find((key) => key.endsWith('/sqlite-history.ts'));
if (!sqliteHistory || editor.has(sqliteHistory)) throw Error('SQLITE_HISTORY_NOT_LAZY');
const moldEngine = keys.find((key) => manifest[key].name === 'csg');
if (!moldEngine || editor.has(moldEngine)) throw Error('MOLD_ENGINE_NOT_LAZY');
const toolPdfExporters = ['rib-pdf.ts', 'orthogonal-cutter-pdf.ts'];
for (const file of toolPdfExporters) {
  const key = keys.find((key) => key.endsWith('/' + file));
  if (!key || !manifest[key].isDynamicEntry || editor.has(key))
    throw Error(`TOOL_PDF_NOT_LAZY: ${file}`);
}
const editorSummary = summary(editor);
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      entryStaticJs: summary(core),
      editorIncludingLazyViewportJs: editorSummary,
      viewportAdditionalJs: summary(incrementalGraph(manifest, viewerGraph, core)),
      roadmapBudget: budgetResult(editorSummary.rawBytes, 600_000, enforcing),
      note: 'Viewport is requested on first render. PDF, WASM, workers and optional imports excluded. Not an LCP measurement.',
      pdfAndFontLazy: true,
      toolPdfExportersLazy: true,
      cutterBundleLazy: true,
      sqliteHistoryLazy: true,
      moldEngineLazy: true,
      optionalToolsLazy: optionalTools,
    },
    null,
    2,
  ),
);

if (enforcing && !budgetResult(editorSummary.rawBytes).met) {
  console.error('EDITOR_BUNDLE_BUDGET_EXCEEDED');
  process.exitCode = 1;
}
