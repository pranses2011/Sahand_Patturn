/** Static manifest closure only: dynamic imports are deliberately not traversed. */
export function staticGraph(manifest, key, found = new Set()) {
  if (found.has(key)) return found;
  if (!Object.hasOwn(manifest, key)) throw new Error(`BUILD_CHUNK_MISSING:${key}`);
  found.add(key);
  for (const imported of manifest[key].imports ?? []) staticGraph(manifest, imported, found);
  return found;
}

export function graphFiles(manifest, graph) {
  return [
    ...new Set(
      [...graph]
        .map((key) => {
          if (!Object.hasOwn(manifest, key)) throw new Error(`BUILD_CHUNK_MISSING:${key}`);
          return manifest[key].file;
        })
        .filter((name) => typeof name === 'string' && name.endsWith('.js')),
    ),
  ];
}
