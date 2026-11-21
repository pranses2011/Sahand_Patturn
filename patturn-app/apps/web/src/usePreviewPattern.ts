import { useMemo } from 'react';
import type { PatternDef } from '@patturn/patterns';

/** Stable preview payload: unrelated editor renders must not re-upload GPU geometry/texture.
 * Build only the repeated tile; the full physical canvas is generated separately for export.
 */
export function usePreviewPattern(def: PatternDef, tileSize: number) {
  return useMemo(
    () => ({
      paths: def.build({
        canvasW: tileSize,
        canvasH: tileSize,
        tileW: tileSize,
        tileH: tileSize,
        seed: 42,
        params: { ...def.defaults },
      }),
      tileW: tileSize,
      strokeMm: typeof def.defaults['stroke'] === 'number' ? def.defaults['stroke'] : 1.5,
    }),
    [def, tileSize],
  );
}
