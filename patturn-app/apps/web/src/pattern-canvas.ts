import type { Path, PatternDef } from '@patturn/patterns';

/** One lazily built physical canvas per immutable pattern/tile-size input pair. */
export function createPatternCanvas(def: PatternDef, tileSize: number): () => Path[] {
  let cached: Path[] | undefined;
  return () => {
    if (cached === undefined) cached = def.build({
      canvasW: 300, canvasH: 300, tileW: tileSize, tileH: tileSize, seed: 42,
      params: { ...def.defaults },
    });
    return cached;
  };
}
