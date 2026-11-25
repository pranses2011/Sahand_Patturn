import { graphFiles } from './bundle-graph.mjs';
import { gzipSync } from 'node:zlib';

/** Sum emitted JS bytes once per output path. Gzip is per-file, as delivered over HTTP. */
export function measureGraph(manifest, graph, readBytes) {
  const chunks = graphFiles(manifest, graph).map((file) => {
    const bytes = readBytes(file);
    return { file, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  });
  chunks.sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file, 'en'));
  return {
    rawBytes: chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
    gzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    chunks,
  };
}

export function budgetResult(actualRawBytes, limitRawBytes = 600_000, enforcing = false) {
  if (
    ![actualRawBytes, limitRawBytes].every(Number.isSafeInteger) ||
    actualRawBytes < 0 ||
    limitRawBytes <= 0
  )
    throw Error('INVALID_BUNDLE_BUDGET');
  return {
    limitRawBytes,
    actualRawBytes,
    excessRawBytes: Math.max(0, actualRawBytes - limitRawBytes),
    met: actualRawBytes < limitRawBytes,
    scope: 'editorIncludingLazyViewportJs',
    enforcing,
  };
}

/** Compare actual emitted paths, not manifest aliases, to avoid charging shared output twice. */
export function incrementalGraph(manifest, graph, baseline) {
  graphFiles(manifest, graph); // Validate keys before filtering aliases.
  const initialFiles = new Set(graphFiles(manifest, baseline));
  return new Set([...graph].filter((key) => !initialFiles.has(manifest[key]?.file)));
}
