import { buildOffsetBarrier, analyzeMotherRelease } from '@patturn/molds';
import type { Mesh } from '@patturn/kernel';

self.onmessage = async (event: MessageEvent<Mesh>) => {
  try {
    // Coarser bounded resolution keeps nonconvex Minkowski calculations practical.
    const result = await buildOffsetBarrier(event.data, { segments: 16, casting: {} });
    try {
      result.release = await analyzeMotherRelease(event.data, result.halves);
    } catch (error) {
      // Keep validated geometry downloadable, but never imply the check succeeded.
      result.releaseError = String(error);
    }
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
